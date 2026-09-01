import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { router } from '@/lib/router'
import { getConfig } from '@/lib/config'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error('[oRPC]', error)
    }),
  ],
})

async function handleRequest(request: Request) {
  const { controlPlaneToken } = getConfig()
  if (!controlPlaneToken && process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'CONTROL_PLANE_TOKEN is required in production' }, { status: 503 })
  }
  if (controlPlaneToken && request.headers.get('authorization') !== `Bearer ${controlPlaneToken}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {},
  })

  return response ?? new Response('Not found', { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
