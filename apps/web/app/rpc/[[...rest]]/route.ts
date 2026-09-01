const apiOrigin = (
  process.env.API_INTERNAL_URL || "http://localhost:3001"
).replace(/\/$/, "")

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ rest?: string[] }> }
) {
  const token = process.env.API_CONTROL_PLANE_TOKEN?.trim()
  if (!token && process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "API_CONTROL_PLANE_TOKEN is required in production" },
      { status: 503 }
    )
  }

  const { rest = [] } = await context.params
  const sourceUrl = new URL(request.url)
  const destination = new URL(
    `/rpc/${rest.map(encodeURIComponent).join("/")}`,
    apiOrigin
  )
  destination.search = sourceUrl.search

  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("content-length")
  if (token) headers.set("authorization", `Bearer ${token}`)

  return fetch(destination, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  })
}

export const HEAD = proxyRequest
export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest
