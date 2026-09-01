import { getRuntimeReadiness } from '@/lib/config'

// Readiness must reflect the runtime environment, not the build environment.
export const dynamic = 'force-dynamic'

export default function ApiHome() {
  const readiness = getRuntimeReadiness()

  return (
    <main>
      <section>
        <p>SUPERSET / DEVIN / CONTROL PLANE</p>
        <h1>API is online.</h1>
        <p>
          The typed oRPC endpoint is mounted at <code>/rpc</code>. Health checks are available at{' '}
          <a href="/api/health">/api/health</a>.
        </p>
        <pre>{JSON.stringify(readiness, null, 2)}</pre>
      </section>
    </main>
  )
}
