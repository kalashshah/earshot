import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { earshotFetch } from '@/lib/earshot-api'

// In-app sign-in. The iPhone opens this in a web auth sheet with ?challenge=sha256(verifier);
// once signed in, we mint a pairing code bound to that challenge and hand it back over earshot://.
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge') ?? ''
  if (!/^[0-9a-f]{64}$/.test(challenge)) return new Response('Open this from the Earshot app.', { status: 400 })

  const { env, session } = await getSession()
  if (!session) return Response.redirect(new URL(`/sign-in?next=${encodeURIComponent(`/app-link?challenge=${challenge}`)}`, request.url), 302)

  const res = await earshotFetch(env, session.user, '/devices/pair-code', { method: 'POST', body: JSON.stringify({ challenge }), contentType: 'application/json' })
  const back = new URL('earshot://paired')
  if (res.ok) back.searchParams.set('code', (await res.json<{ code: string }>()).code)
  else back.searchParams.set('error', (await res.json<{ error?: string }>().catch(() => ({ error: undefined }))).error || 'Could not sign in.')
  return new Response(null, { status: 302, headers: { location: back.toString(), 'cache-control': 'no-store' } })
}
