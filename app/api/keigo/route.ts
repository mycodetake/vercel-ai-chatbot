import 'server-only'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/lib/db_types'

export const runtime = 'edge'

const MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'openai/gpt-oss-20b:free',
]

const SCENE_PROMPTS: Record<string, string> = {
  general: '一般的なビジネス敬語に変換してください。',
  email:   'ビジネスメール形式で出力してください。件名、宛名、本文、締めの構成で出力すること。',
  decline: '丁寧にお断りする敬語に変換してください。①お断りの言葉、②理由、③締めの3段構成で。',
  apology: '誠意が伝わるお詫びの敬語に変換してください。①お詫び、②原因、③対応策の3段構成で。',
  request: '丁寧なお願いの敬語に変換してください。①背景、②依頼内容、③お礼の3段構成で。',
  report:  '上司への報告形式で出力してください。①報告事項、②現状、③今後の対応の3段構成で。',
}

function buildPrompt(selectedScene: string): string {
  const sceneInstruction = SCENE_PROMPTS[selectedScene] || SCENE_PROMPTS.general
  return `You are a Japanese business keigo conversion assistant.

CRITICAL LANGUAGE RULE:
- Input in Simplified Chinese → write 解説 in Simplified Chinese ONLY
- Input in English → write 解説 in English ONLY
- Input in Japanese → write 解説 in Japanese ONLY
- NEVER use Traditional Chinese

【場景】${sceneInstruction}

【出力フォーマット】
---敬語バージョン---
（変換後の敬語文）

---解説---
（入力言語で説明）

---読み方---
（難しい漢字にふりがな）`
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  })
}

export async function POST(req: Request) {
  // 认证
  let userId: string | undefined

  const authHeader = req.headers.get('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    try {
      const supabaseResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          }
        }
      )
      if (supabaseResponse.ok) {
        const userData = await supabaseResponse.json()
        userId = userData.id
      }
    } catch {}
  }

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }

  const { text, selectedScene } = await req.json()
  const systemPrompt = buildPrompt(selectedScene ?? 'general')
  const apiKey = process.env.OPENAI_API_KEY

  // 自动切换模型
  let result = ''
  let lastError = ''

  for (const model of MODELS) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://vercel-ai-chatbot-delta.vercel.app',
          'X-Title': 'Keigo App'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.7,
          stream: false
        })
      })

      if (response.status === 503 || response.status === 404) {
        lastError = `Model ${model} unavailable (${response.status})`
        continue
      }

      if (!response.ok) {
        lastError = `Model ${model} error (${response.status})`
        continue
      }

      const data = await response.json()
      result = data.choices?.[0]?.message?.content || ''
      break

    } catch (e) {
      lastError = `Model ${model} failed`
      continue
    }
  }

  if (!result) {
    return new Response(
      JSON.stringify({ error: lastError || 'All models unavailable' }),
      {
        status: 503,
        headers: { 'Access-Control-Allow-Origin': '*' }
      }
    )
  }

  return new Response(
    JSON.stringify({ result }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  )
}