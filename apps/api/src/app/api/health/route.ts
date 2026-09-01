import { getRuntimeReadiness } from '@/lib/config'

// Readiness must reflect the runtime environment, not the build environment.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({
    ok: true,
    service: 'remediation-control-api',
    timestamp: new Date().toISOString(),
    readiness: getRuntimeReadiness(),
  })
}
