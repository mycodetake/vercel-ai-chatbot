import 'server-only'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/lib/db_types'
import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

// 场景对应的日语说明
const SCENE_PROMPTS: Record<string, string> = {
  general: '一般的なビジネス敬語に変換してください。',
  email:   'ビジネスメール用の敬語に変換してください。件名が必要な場合は件名も提案してください。',
  decline: '丁寧にお断りする敬語表現に変換してください。相手への配慮を忘れずに。',
  apology: '誠意が伝わるお詫びの敬語表現に変換してください。',
  request: '相手に負担をかけないような、丁寧なお願いの敬語表現に変換してください。',
  report:  '上司への報告・連絡に適した敬語表現に変換してください。',
}

function buildSystemPrompt(selectedScene: string, studyMode: boolean): string {
  const sceneInstruction = SCENE_PROMPTS[selectedScene] || SCENE_PROMPTS.general

  const studyInstruction = studyMode
    ? `
---解説---
（使用した敬語表現の説明を、ユーザーの入力言語で行う。箇条書きで簡潔に。）

---読み方---
（難しい漢字にふりがなを付ける　例：出席(しゅっせき)　会議(かいぎ)）`
    : `
※解説と読み方は出力しないこと。敬語バージョンのみ出力すること。`

  return `あなたは日本語敬語変換の専門アシスタントです。

【今回の場景】
${sceneInstruction}

【共通ルール】
1. ユーザーが日本語以外（英語・中国語など）で入力した場合、その意図を理解した上で、直接日本語のビジネス敬語に変換する
2. ユーザーが普通の日本語で入力した場合、それをビジネス敬語に変換する
3. 必ず以下のフォーマットで出力する

【出力フォーマット】
---敬語バージョン---
（変換後の敬語文）
${studyInstruction}

【例】
ユーザー入力：「明日の会議に来てください」
出力：
---敬語バージョン---
明日の会議にご出席いただけますでしょうか。

---解説---
・「来てください」→「ご出席いただけますでしょうか」
・「ご〜いただく」は相手の行為に対する謙譲表現で、丁寧なお願いになります。

---読み方---
出席(しゅっせき)　会議(かいぎ)`
}

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore
  })
  const json = await req.json()
  const { messages, previewToken, selectedScene, studyMode } = json
  const userId = (await auth({ cookieStore }))?.user.id

  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const apiKey = previewToken || process.env.OPENAI_API_KEY
  const systemPrompt = buildSystemPrompt(selectedScene ?? 'general', studyMode ?? true)

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://vercel-ai-chatbot-delta.vercel.app',
      'X-Title': 'Keigo App'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b:free',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...messages
      ],
      temperature: 0.7,
      stream: true
    })
  })

  const stream = OpenAIStream(res, {
    async onCompletion(completion) {
      const title = json.messages[0].content.substring(0, 100)
      const id = json.id ?? nanoid()
      const createdAt = Date.now()
      const path = `/chat/${id}`
      const payload = {
        id,
        title,
        userId,
        createdAt,
        path,
        messages: [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ]
      }
      await supabase.from('chats').upsert({ id, payload }).throwOnError()
    }
  })

  return new StreamingTextResponse(stream)
}
