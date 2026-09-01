import { getConfig } from '@/lib/config'
import { startDependencyScanSession } from '@/lib/scanner'

function isAuthorized(request: Request): boolean {
  const { cronSecret } = getConfig()
  return Boolean(cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`)
}

async function handleRequest(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { session, reused } = await startDependencyScanSession()
    return Response.json({
      ok: true,
      sessionId: session.sessionId,
      url: session.url,
      title: session.title,
      reused,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dependency scan launch failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const GET = handleRequest
export const POST = handleRequest
