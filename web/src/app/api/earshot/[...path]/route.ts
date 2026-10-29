import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createAuth } from '@/lib/auth'
import { earshotFetch } from '@/lib/earshot-api'

// The browser's only door to earshot-api. Identity comes from the session, never from the
// request: only method, query, body and content-type are forwarded (no cookies).
async function handler(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const session = await createAuth(env).api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { path } = await params
  const { search } = new URL(request.url)
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const upstream = await earshotFetch(env, session.user, '/' + path.map(encodeURIComponent).join('/') + search, {
    method: request.method,
    body: hasBody ? await request.arrayBuffer() : null,
    contentType: request.headers.get('content-type'),
  })

  const headers = new Headers({ 'cache-control': 'no-store' })
  for (const h of ['content-type', 'content-disposition']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}

export const GET = handler
export const POST = handler
export const PATCH = handler
export const DELETE = handler
