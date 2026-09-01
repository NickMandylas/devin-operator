import { getConfig } from '@/lib/config'
import { handleGitHubWebhook, verifyGitHubSignature } from '@/lib/webhook'

export async function POST(request: Request) {
  const config = getConfig()
  if (!config.webhookSecret) {
    return Response.json({ error: 'GITHUB_WEBHOOK_SECRET is not configured' }, { status: 503 })
  }

  const rawPayload = await request.text()
  if (!verifyGitHubSignature(rawPayload, request.headers.get('x-hub-signature-256'), config.webhookSecret)) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  const event = request.headers.get('x-github-event')
  if (!event) return Response.json({ error: 'Missing x-github-event header' }, { status: 400 })

  try {
    const result = await handleGitHubWebhook(event, JSON.parse(rawPayload))
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed'
    console.error('[GitHub webhook]', error)
    return Response.json({ error: message }, { status: 500 })
  }
}
