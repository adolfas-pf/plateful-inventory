import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, context } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages required' })
  }

  const systemPrompt = `You are an S&OP and inventory planning assistant for Plateful, a DTC cookware brand. You have access to their live operations data.

Current business context:
${context || 'No context provided'}

Your role:
- Answer questions about inventory levels, stockouts, transfer orders, and forecasts
- Help interpret the data and spot risks
- Suggest actions based on inventory planning best practices
- Be direct and specific — this is an operations tool, not a chatbot

Rules:
- Always refer to specific SKUs, dates, and numbers from the context when relevant
- Flag stockout risks clearly
- Keep answers concise — operations people are busy
- If you don't have enough data to answer, say so clearly rather than guessing`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return res.status(500).json({ error: err })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    return res.status(200).json({ reply: text })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
}
