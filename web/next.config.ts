import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

// Pin the root: a stray lockfile in $HOME otherwise makes Turbopack scan (and fail on) ~/Desktop.
const nextConfig: NextConfig = { devIndicators: false, turbopack: { root: __dirname } }

export default nextConfig

// Gives `next dev` the wrangler.jsonc bindings (local D1, .dev.vars). Remote bindings off so
// dev never sends real email; sign-in codes are logged instead (see sendEmail in auth.ts).
initOpenNextCloudflareForDev({ remoteBindings: false })
