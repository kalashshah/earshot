'use client'

import type { ReactNode } from 'react'

export class AuthError extends Error {}

/** Calls earshot-api through /api/earshot. A 401 means the session ended: back to sign-in. */
export async function api<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await apiRaw(path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export async function apiRaw(path: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch('/api/earshot' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (res.status === 401) {
    window.location.href = '/sign-in'
    throw new AuthError('Unauthorized')
  }
  return res
}

/** Downloads GET /export and returns the file name. */
export async function exportEverything() {
  const res = await apiRaw('/export')
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  const name = (res.headers.get('content-disposition') || '').match(/filename="?([^";]+)/)?.[1] || 'earshot-export.json'
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return name
}

export const Spin = () => <span className="spin" />

export const Loading = ({ n = 3 }: { n?: number }) => (
  <>{Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ width: `${90 - i * 17}%` }} />)}</>
)

export const Empty = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="card empty">{icons.emptyWave}<b>{title}</b>{children}</div>
)

export const ErrBox = ({ error }: { error: unknown }) =>
  error && !(error instanceof AuthError) ? <div className="err" role="alert">{error instanceof Error ? error.message : String(error)}</div> : null

export const Head = ({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) => (
  <div className="head"><div><h1>{title}</h1><p className="sub">{sub}</p></div>{children}</div>
)

export const Powered = () => <>Powered by <b>NVIDIA Nemotron</b> on <b>Nebius Token Factory</b> · <b>Tavily</b></>

const s16 = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true } as const
const s20 = { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true } as const

export const icons = {
  logo: (
    // eslint-disable-next-line @next/next/no-img-element -- 26px brand mark, next/image adds nothing
    <img src="/logo.png" width={26} height={26} alt="" style={{ borderRadius: 7, display: 'block' }} />
  ),
  today: <svg {...s16}><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" strokeLinecap="round" /></svg>,
  promises: <svg {...s16}><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M5.5 8.2l1.8 1.8 3.3-3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  ask: <svg {...s16}><path d="M2.5 7.5a5.5 5 0 1 1 2.6 4.3L2.5 13l.8-2.4a4.8 4.8 0 0 1-.8-3.1z" strokeLinejoin="round" /></svg>,
  timeline: <svg {...s16}><path d="M4 8v0M6.5 5v6M9 3v10M11.5 6v4M14 7.5v1" strokeLinecap="round" /></svg>,
  memory: <svg {...s16}><ellipse cx="8" cy="4" rx="5.5" ry="2" /><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" /></svg>,
  privacy: <svg {...s16}><path d="M8 1.8l5 2v4c0 3-2.2 5.3-5 6.4-2.8-1.1-5-3.4-5-6.4v-4z" strokeLinejoin="round" /></svg>,
  settings: <svg {...s16}><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" strokeLinecap="round" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></svg>,
  shield: <svg {...s20}><path d="M8 1.8l5 2v4c0 3-2.2 5.3-5 6.4-2.8-1.1-5-3.4-5-6.4v-4z" strokeLinejoin="round" /><path d="M5.8 8l1.6 1.6 2.9-3" strokeLinecap="round" /></svg>,
  trash: <svg {...s20}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  link: <svg {...s20}><path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.7.7M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.7-.7" strokeLinecap="round" /></svg>,
  phone: <svg width="40" height="40" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="7.5" y="3" width="11" height="20" rx="2.5" /><path d="M11.5 19.5h3" strokeLinecap="round" /></svg>,
  emptyWave: <svg width="40" height="40" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7.5 13v0M10.5 10v6M13.5 7v12M16.5 10v6M19.5 12v2" strokeLinecap="round" /></svg>,
  timelineSm: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 8v0M6.5 5v6M9 3v10M11.5 6v4M14 7.5v1" strokeLinecap="round" /></svg>,
}

/** Tells the sidebar to refresh its open-promises count. */
export const refreshCounts = () => window.dispatchEvent(new Event('earshot:counts'))
