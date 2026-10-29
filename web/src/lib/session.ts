import { headers } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createAuth } from './auth'

export async function getSession() {
  const { env } = await getCloudflareContext({ async: true })
  return { env, session: await createAuth(env).api.getSession({ headers: await headers() }) }
}
