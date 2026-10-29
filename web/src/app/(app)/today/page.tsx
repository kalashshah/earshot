'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, Empty, ErrBox, Head, icons, Loading, Spin } from '@/components/ui'
import { fmtIsoDay, fmtTime, parseJSON, renderMd, safeUrl, type Source } from '@/lib/format'

type Brief = { day: string; content: string; sources: string; created_at?: number }
type Moment = { id: string; title: string; prep?: string | null; ideas?: string | null; next: string }
type Routine = { id: string; kind: 'time' | 'place'; title: string; days?: string | null; time?: string | null; place?: string | null; leave?: number }
const DAY_NAMES: Record<string, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }
const routineWhen = (r: Routine) => r.kind === 'place'
  ? `${r.leave ? 'When you leave' : 'When you get to'} ${r.place}`
  : `${(parseJSON<string[]>(r.days ?? '[]', []).map((d) => DAY_NAMES[d]).join(', ')) || 'Every day'} at ${r.time}`

async function fetchBriefs() {
  const list = (await api<{ briefs?: Brief[] }>('/briefs?limit=7')).briefs || []
  if (list.length) return { list, firstRun: false }
  // No brief yet: a brand-new account (no phone, nothing recorded) gets pointed at pairing.
  const [d, r] = await Promise.all([api<{ devices?: unknown[] }>('/devices'), api<{ recordings?: unknown[] }>('/recordings?limit=1')])
  return { list, firstRun: !d.devices?.length && !r.recordings?.length }
}

export default function TodayPage() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null)
  const [firstRun, setFirstRun] = useState(false)
  const [sel, setSel] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<React.ReactNode>(null)

  const [moments, setMoments] = useState<Moment[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const load = () => fetchBriefs().then(({ list, firstRun }) => { setFirstRun(firstRun); setBriefs(list) }, setError)
  useEffect(() => {
    load()
    api<{ moments?: Moment[] }>('/moments').then((r) => setMoments(r.moments || []), () => {})
    api<{ routines?: Routine[] }>('/routines').then((r) => setRoutines(r.routines || []), () => {})
  }, [])
  const forgetRoutine = (id: string) => api(`/routines/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => setRoutines((r) => r.filter((x) => x.id !== id)), setError)
  const forget = (id: string) => api(`/moments/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => setMoments((m) => m.filter((x) => x.id !== id)), setError)

  async function run() {
    setRunning(true)
    setRunMsg(<div className="note">Gathering yesterday’s conversations, searching news with Tavily and asking Nemotron Ultra. This takes 30–60 seconds.</div>)
    try {
      const r = await api<{ day: string; skipped?: string }>('/briefs/run', { body: {} })
      if (r.skipped) setRunMsg(<div className="note">No brief for {fmtIsoDay(r.day)}: {r.skipped}.</div>)
      else { setRunMsg(null); setSel(0); await load() }
    } catch (e) { setRunMsg(<ErrBox error={e} />) }
    setRunning(false)
  }

  const b = briefs?.[sel]
  const sources = b ? parseJSON<Source[]>(b.sources, []) : []

  return (
    <>
      <Head title="Morning brief" sub="Yesterday’s conversations, promises and news, written by Nemotron Ultra.">
        <button className="btn" onClick={run} disabled={running}>{running ? <><Spin /> Writing brief…</> : 'Run brief now'}</button>
      </Head>
      <div aria-live="polite">{runMsg}</div>
      {moments.length > 0 && (
        <>
          <h2 className="group">Coming up <span className="n">{moments.length}</span></h2>
          <div className="card list" style={{ marginBottom: 20 }}>
            {moments.slice(0, 6).map((m) => (
              <div className="row" key={m.id}>
                <div className="row-top">
                  <div className="min-w-0 flex-1">
                    <div className="row-title">{m.title}</div>
                    {m.prep && <div className="muted" style={{ fontSize: 13 }}>{m.prep.charAt(0).toUpperCase() + m.prep.slice(1)}</div>}
                    {m.ideas && <div className="row-meta">{m.ideas}</div>}
                  </div>
                  <span className="badge due">{fmtIsoDay(m.next, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <button className="btn ghost sm" onClick={() => forget(m.id)} aria-label={`Forget ${m.title}`}>Forget</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {routines.length > 0 && (
        <>
          <h2 className="group">Routines &amp; places <span className="n">{routines.length}</span></h2>
          <div className="card list" style={{ marginBottom: 20 }}>
            {routines.map((r) => (
              <div className="row" key={r.id}>
                <div className="row-top">
                  <div className="min-w-0 flex-1">
                    <div className="row-title">{r.title}</div>
                    <div className="row-meta">{routineWhen(r)}</div>
                  </div>
                  <button className="btn ghost sm" onClick={() => forgetRoutine(r.id)} aria-label={`Forget ${r.title}`}>Forget</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {error ? <ErrBox error={error} /> : !briefs ? <Loading n={5} /> : !b ? (
        firstRun ? (
          <div className="card empty">
            {icons.phone}
            <b>Welcome to Earshot</b>
            <p>Pair your iPhone to start. Your Apple Watch records through it, and every morning at 7:00 a brief like this one appears here.</p>
            <p style={{ marginTop: 14 }}><Link className="btn primary" href="/settings#devices" style={{ textDecoration: 'none' }}>Settings → Pair your iPhone</Link></p>
          </div>
        ) : (
          <Empty title="No brief yet"><p>Every morning at 7:00 Earshot reads yesterday’s conversations and writes a brief. Record a conversation on your watch, or run one now.</p></Empty>
        )
      ) : (
        <>
          {briefs.length > 1 && (
            <div className="daypick" role="group" aria-label="Brief day">
              {briefs.map((x, i) => <button key={x.day} aria-pressed={i === sel} onClick={() => setSel(i)}>{i === 0 ? 'Latest' : fmtIsoDay(x.day)}</button>)}
            </div>
          )}
          <article className="card brief">
            <div className="brief-meta"><span>For {fmtIsoDay(b.day, { weekday: 'long', month: 'long', day: 'numeric' })}</span>{b.created_at ? <span>Written {fmtTime(b.created_at)}</span> : null}</div>
            {/* renderMd escapes all input before adding its own tags. */}
            <div dangerouslySetInnerHTML={{ __html: renderMd(b.content, sources) }} />
            {sources.length > 0 && (
              <div className="sources">
                <span className="faint">Sources · Tavily</span>
                <ol>{sources.map((s) => (
                  <li key={String(s.n)} value={Number(s.n)}>
                    <a href={safeUrl(s.url)} target="_blank" rel="noopener">{s.title}</a>{s.org ? <span className="faint"> · {s.org}</span> : null}
                  </li>
                ))}</ol>
              </div>
            )}
          </article>
        </>
      )}
    </>
  )
}

