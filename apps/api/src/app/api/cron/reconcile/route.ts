import { getConfig } from '@/lib/config'
import { reconcileSessions } from '@/lib/automation'

function isAuthorized(request: Request): boolean {
  const { cronSecret } = getConfig()
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`)
}

async function handleRequest(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return Response.json(await reconcileSessions())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reconciliation failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const GET = handleRequest
export const POST = handleRequest
