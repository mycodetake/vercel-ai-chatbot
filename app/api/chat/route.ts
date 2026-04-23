import 'server-only'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/lib/db_types'
import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

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
（ここに解説を書く。言語ルール：入力が中文なら简体中文のみで書け、入力が英語ならEnglishのみで書け、入力が日本語なら日本語のみで書け。繁体字を使うな。）

---読み方---
（難しい漢字にふりがなを付ける　例：出席(しゅっせき)）`
    : `
※解説と読み方は出力しないこと。`

  return `You are a Japanese business keigo conversion assistant.

CRITICAL LANGUAGE RULE - MUST FOLLOW:
- If user input is in Simplified Chinese (简体中文) → write the 解説 section in Simplified Chinese ONLY
- If user input is in English → write the 解説 section in English ONLY  
- If user input is in Japanese → write the 解説 section in Japanese ONLY
- NEVER use Traditional Chinese (繁体字). ALWAYS use Simplified Chinese for Chinese users.

【場景】
${sceneInstruction}

【変換ルール】
1. 日本語以外の入力→意図を理解して日本語ビジネス敬語に変換
2. 普通の日本語→ビジネス敬語に変換
3. 以下のフォーマットで出力

【出力フォーマット】
---敬語バージョン---
（変換後の敬語文）
${studyInstruction}

【例：中文入力の場合】
入力：「明天的会议我去不了」
出力：
---敬語バージョン---
誠に申し訳ございませんが、明日の会議には出席できかねます。

---解説---
・「我去不了」→「出席できかねます」：用"できかねる"表示委婉的否定。
・「誠に申し訳ございませんが」：道歉语，体现对对方的关心。

---読み方---
出席(しゅっせき)　会議(かいぎ)　申し訳(もうしわけ)

【例：英語入力の場合】
入力：「I cannot attend tomorrow's meeting」
出力：
---敬語バージョン---
誠に恐縮ではございますが、明日の会議には出席いたしかねます。

---解説---
・「cannot attend」→「出席いたしかねます」: "いたす" is humble form, "かねます" softens the refusal.
・「誠に恐縮ではございますが」: Apologetic opener showing consideration.

---読み方---
出席(しゅっせき)　恐縮(きょうしゅく)`
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
      model: 'deepseek/deepseek-chat:free',
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