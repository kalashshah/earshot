'use client'

import Link from 'next/link'
import { useState } from 'react'
import { emailOtp, signIn } from '@/lib/auth-client'
import { Particles } from '@/components/particles'
import { icons, Spin } from '@/components/ui'

export function SignInForm({ google, next }: { google: boolean; next: string }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true); setError('')
    const { error } = await emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' }).catch(() => ({ error: { message: 'Could not reach Earshot. Check your connection.' } }))
    setBusy(false)
    if (error) return setError(error.message || 'Could not send a code.')
    setCode(''); setStep('code')
  }

  async function verify(value = code) {
    if (value.length !== 6) return
    setBusy(true); setError('')
    const { error } = await signIn.emailOtp({ email: email.trim(), otp: value }).catch(() => ({ error: { message: 'Could not reach Earshot. Check your connection.' } }))
    if (error) {
      setBusy(false)
      return setError('code' in error && error.code === 'INVALID_OTP' ? 'That code didn’t work. Check the email, or send a new code.' : error.message || 'That code didn’t work.')
    }
    window.location.href = next
  }

  async function withGoogle() {
    setError('')
    const { error } = await signIn.social({ provider: 'google', callbackURL: next }).catch(() => ({ error: { message: 'Google sign-in failed.' } }))
    if (error) setError(error.message || 'Google sign-in failed.')
  }

  return (
    <div className="signin">
      <Particles className="signin-particles" pitch={0.3} />
      <Link className="back" href="/">← Back to home</Link>
      <div className="card">
        {icons.logo}
        <h1>Earshot</h1>
        <p className="sub">A private memory of everything you say out loud.</p>

        {step === 'email' ? (
          <>
            {google && (
              <>
                <button className="btn" type="button" onClick={withGoogle} style={{ marginTop: 22 }}>
                  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" /><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z" /></svg>
                  Continue with Google
                </button>
                <div className="faint" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 0', fontSize: 12 }}>
                  <span style={{ flex: 1, borderTop: '1px solid var(--line)' }} />or<span style={{ flex: 1, borderTop: '1px solid var(--line)' }} />
                </div>
              </>
            )}
            <form onSubmit={sendCode}>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              {error && <div className="err" role="alert">{error}</div>}
              <button className="btn primary" type="submit" disabled={busy}>{busy ? <><Spin /> Sending code</> : 'Email me a code'}</button>
            </form>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); verify() }}>
            <label htmlFor="code">We sent a 6-digit code to <b style={{ color: 'var(--text)', fontWeight: 600 }}>{email}</b></label>
            <input
              id="code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} pattern="\d{6}"
              value={code} disabled={busy} placeholder="••••••"
              style={{ font: '600 24px/1.2 var(--mono)', letterSpacing: '.4em', textAlign: 'center', padding: '10px 0 10px .4em' }}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) verify(v) }}
            />
            {error && <div className="err" role="alert">{error}</div>}
            <button className="btn primary" type="submit" disabled={busy || code.length !== 6}>{busy ? <><Spin /> Signing in</> : 'Sign in'}</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12.5 }}>
              <button type="button" className="signout" style={{ margin: 0 }} onClick={() => { setStep('email'); setError('') }}>Use a different email</button>
              <button type="button" className="signout" style={{ margin: 0 }} disabled={busy} onClick={() => sendCode()}>Send a new code</button>
            </div>
          </form>
        )}
        <p className="faint" style={{ fontSize: 11.5, margin: '20px 0 0', textAlign: 'center' }}>Powered by NVIDIA Nemotron on Nebius Token Factory · Tavily</p>
      </div>
    </div>
  )
}
