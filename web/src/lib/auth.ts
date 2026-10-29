import { betterAuth } from 'better-auth'
import { drizzle } from 'drizzle-orm/d1'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins'
import * as schema from './schema'
import { earshotFetch } from './earshot-api'

// One instance per isolate: building Better Auth is CPU-heavy (~100ms+). Keyed by the
// D1 binding so a different env gets its own instance.
const instances = new WeakMap<object, ReturnType<typeof buildAuth>>()

export function createAuth(env: CloudflareEnv) {
  let auth = instances.get(env.DB)
  if (!auth) {
    auth = buildAuth(env)
    instances.set(env.DB, auth)
  }
  return auth
}

export const googleEnabled = (env: CloudflareEnv) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

function buildAuth(env: CloudflareEnv) {
  const db = drizzle(env.DB, { schema })
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, rateLimit: schema.rateLimit },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    // Session checks read a signed cookie instead of D1 for up to 5 minutes.
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    // Codes are capped per IP per hour so the form can't spam inboxes from our domain.
    rateLimit: { enabled: process.env.NODE_ENV === 'production', storage: 'database', customRules: { '/email-otp/send-verification-otp': { window: 3600, max: 10 } } },
    user: {
      deleteUser: {
        enabled: true,
        // Erase everything in earshot-api first; if that fails the account stays.
        beforeDelete: async (user) => {
          const res = await earshotFetch(env, user, '/me', { method: 'DELETE' })
          if (!res.ok) throw new Error(`earshot-api DELETE /me failed (${res.status})`)
        },
      },
    },
    ...(googleEnabled(env) ? { socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } } : {}),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        sendVerificationOTP: async ({ email, otp }) => {
          await sendEmail(env, { to: email, subject: 'Your Earshot sign-in code', text: `Your Earshot sign-in code is ${otp}. It expires in 10 minutes.`, html: otpHtml(otp) })
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof buildAuth>

/** Codes go out through Cloudflare Email Sending; in `next dev` or with no binding they are logged. */
async function sendEmail(env: CloudflareEnv, m: { to: string; subject: string; text: string; html: string }) {
  if (!env.EMAIL || process.env.NODE_ENV === 'development') {
    console.log(`[email:dev] to=${m.to} subject="${m.subject}"\n${m.text}`)
    return
  }
  const from = env.EMAIL_FROM || 'Earshot <earshot@mail.keronlabs.com>'
  const parts = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  await env.EMAIL.send({ ...m, from: parts ? { name: parts[1], email: parts[2] } : from })
}

function otpHtml(otp: string) {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1c1a;background:#fbfbfa;padding:32px"><div style="max-width:480px;margin:0 auto;text-align:center"><div style="font-weight:650;font-size:20px;letter-spacing:-.01em">Earshot</div><p style="margin:24px 0 16px">Here is your sign-in code.</p><div style="display:inline-block;background:#ffece3;color:#c43c00;border-radius:12px;padding:20px 28px;font:700 34px/1 Menlo,monospace;letter-spacing:8px">${otp}</div><p style="color:#6b6a66;font-size:14px;margin-top:24px">It expires in 10 minutes. If you didn't ask for it, ignore this email.</p></div></body></html>`
}
