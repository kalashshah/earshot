export type ApiUser = { id: string; name: string; email: string }

/**
 * Calls earshot-api as `user`. Production goes over the EARSHOT_API service binding;
 * `next dev` may point EARSHOT_API_URL (in .dev.vars) at a local mock instead.
 */
export function earshotFetch(env: CloudflareEnv, user: ApiUser, pathAndSearch: string, init: { method?: string; body?: BodyInit | null; contentType?: string | null } = {}) {
  const headers = new Headers({
    'x-earshot-internal': env.INTERNAL_SECRET,
    'x-earshot-user': user.id,
    'x-earshot-user-name': encodeURIComponent(user.name || ''),
    'x-earshot-user-email': user.email,
  })
  if (init.contentType) headers.set('content-type', init.contentType)
  const req = { method: init.method || 'GET', headers, body: init.body ?? null }
  if (process.env.NODE_ENV === 'development' && env.EARSHOT_API_URL) return fetch(env.EARSHOT_API_URL + pathAndSearch, req)
  return env.EARSHOT_API.fetch('https://earshot-api' + pathAndSearch, req)
}
