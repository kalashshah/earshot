import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createAuth } from '@/lib/auth'

async function handler(request: Request) {
  const { env } = await getCloudflareContext()
  const auth = createAuth(env)
  return auth.handler(request)
}

export const GET = handler
export const POST = handler
