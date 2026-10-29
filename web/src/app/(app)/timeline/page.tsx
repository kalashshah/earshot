'use client'

import { useEffect, useRef, useState } from 'react'
import { api, Empty, ErrBox, Head, Loading, refreshCounts, Spin } from '@/components/ui'
import { fmtDay, fmtDur, fmtTime, parseJSON, plural } from '@/lib/format'
import { VoiceNote } from '@/components/voice-note'

type Rec = {
  id: string; started_at: number; duration_ms: number; status: string; title?: string | null; summary?: string | null
  transcript?: string | null; memories_added?: number; entities?: string | null; error?: string | null
}
const PAGE = 30
const fetchPage = async (before?: number) =>
  (await api<{ recordings?: Rec[] }>(`/recordings?limit=${PAGE}${before ? `&before=${before}` : ''}`)).recordings || []

export default function TimelinePage() {
  const [recs, setRecs] = useState<Rec[] | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [more, setMore] = useState<{ busy: boolean; error?: unknown }>({ busy: false })

  // ?open=<id> (from Ask or Memory): page back until that conversation is loaded, then expand it.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('open')
    ;(async () => {
      let all = await fetchPage(), last = all.length < PAGE
      for (let i = 0; target && i < 10 && !last && !all.some((r) => r.id === target); i++) {
        const page = await fetchPage(all.at(-1)!.started_at)
        all = all.concat(page); last = page.length < PAGE
      }
      setRecs(all); setDone(last)
      if (target) {
        window.history.replaceState(null, '', '/timeline')
        if (all.some((r) => r.id === target)) setOpen(target)
        else setMissing(true)
      }
    })().catch(setError)
  }, [])

  const [note, setNote] = useState('')

  // A fresh voice note: show it at the top, then re-read the newest page until it's processed.
  // It vanishes from the list if no speech was heard ("empty" isn't listed).
  async function track(r: Pick<Rec, 'id' | 'started_at' | 'duration_ms'>) {
    setNote('')
    setRecs((all) => [{ ...r, status: 'queued' }, ...(all || [])])
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => setTimeout(res, 4000))
      const fresh = (await fetchPage().catch(() => null))?.find((x) => x.id === r.id)
      if (fresh === undefined) { setRecs((all) => all!.filter((x) => x.id !== r.id)); setNote('No speech was heard in that recording.'); return }
      if (!fresh) continue
      setRecs((all) => all!.map((x) => (x.id === r.id ? fresh : x)))
      if (['done', 'failed'].includes(fresh.status)) { refreshCounts(); return }
    }
  }

  async function loadMore() {
    setMore({ busy: true })
    try { const page = await fetchPage(recs!.at(-1)!.started_at); setRecs((r) => r!.concat(page)); setDone(page.length < PAGE); setMore({ busy: false }) }
    catch (e) { setMore({ busy: false, error: e }) }
  }

  const groups: { k: string; at: number; items: Rec[] }[] = []
  for (const r of recs || []) {
    const k = new Date(r.started_at).toDateString()
    if (groups.at(-1)?.k !== k) groups.push({ k, at: r.started_at, items: [] })
    groups.at(-1)!.items.push(r)
  }

  return (
    <>
      <Head title="Timeline" sub="Every conversation your watch heard, newest first. Or record one here.">
        <VoiceNote onUploaded={track} />
      </Head>
      {note && <div className="note">{note}</div>}
      {error ? <ErrBox error={error} /> : !recs ? <Loading n={6} /> : !recs.length ? (
        <Empty title="No conversations yet"><p>Tap record on your Apple Watch, or use Record above. Audio is transcribed, then deleted — what remains shows up here.</p></Empty>
      ) : (
        <>
          {missing && <div className="note">That conversation is no longer available — it may have been forgotten.</div>}
          {groups.map((g) => (
            <section key={g.k}>
              <h2 className="group">{fmtDay(g.at)} <span className="n">{g.items.length}</span></h2>
              <div className="card list">
                {g.items.map((r) => (
                  <RecRow
                    key={r.id} r={r} target={open === r.id}
                    onChange={(patch) => setRecs((all) => all!.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
                    onGone={() => { setRecs((all) => all!.filter((x) => x.id !== r.id)); refreshCounts() }}
                  />
                ))}
              </div>
            </section>
          ))}
          {!done && (
            <div className="more">
              <button className="btn" disabled={more.busy} onClick={loadMore}>{more.busy ? <><Spin /> Loading</> : 'Load more'}</button>
            </div>
          )}
          <ErrBox error={more.error} />
        </>
      )}
    </>
  )
}

function RecRow({ r, target, onChange, onGone }: { r: Rec; target: boolean; onChange: (p: Partial<Rec>) => void; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState<'' | 'retry' | 'forget'>('')
  const [error, setError] = useState<unknown>(null)
  const ent = parseJSON<{ people?: { name: string; org?: string }[]; facts?: string[] }>(r.entities, {})
  const people = ent.people || [], facts = ent.facts || []
  const failed = r.status === 'failed', processing = !['done', 'failed'].includes(r.status)
  const lines = String(r.transcript || '').split('\n').filter(Boolean)

  useEffect(() => {
    if (!target || !ref.current) return
    ref.current.scrollIntoView({ block: 'center' })
    ref.current.querySelector('summary')?.focus({ preventScroll: true })
  }, [target])

  async function retry() {
    setError(null); setBusy('retry')
    try { await api(`/recordings/${encodeURIComponent(r.id)}/retry`, { method: 'POST' }); onChange({ status: 'queued', error: null }) }
    catch (e) { setError(e) }
    setBusy('')
  }
  async function forget() {
    setError(null); setBusy('forget')
    try { await api(`/recordings/${encodeURIComponent(r.id)}`, { method: 'DELETE' }); onGone() }
    catch (e) { setError(e); setBusy('') }
  }

  return (
    <div className={`row rec${target ? ' flash' : ''}`} id={`rec-${r.id}`} ref={ref}>
      <div className="row-top">
        <div className="time">{fmtTime(r.started_at)}</div>
        <div className="min-w-0 flex-1">
          <div className="row-title">
            {r.title || (processing ? 'Transcribing…' : 'Untitled conversation')}{' '}
            {failed ? <span className="badge fail">Failed</span> : processing ? <span className="badge proc">{r.status}</span> : null}
          </div>
          <div className="row-meta">
            <span>{fmtDur(r.duration_ms)}</span>
            {r.memories_added ? <span>{plural(r.memories_added, 'memory', 'memories')}</span> : null}
          </div>
          {r.summary && <div className="sum">{r.summary}</div>}
          {failed && r.error && <div className="err">{r.error}</div>}
          {people.length > 0 && (
            <div className="people">
              {people.map((p, i) => <span key={i} className="chip">{p.name}{p.org && <span className="org"> {p.org}</span>}</span>)}
            </div>
          )}
          {(facts.length > 0 || lines.length > 0) && (
            <details open={target || undefined}>
              <summary>{[facts.length && plural(facts.length, 'fact'), lines.length && 'transcript'].filter(Boolean).join(' · ')}</summary>
              {facts.length > 0 && <ul className="facts">{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>}
              {lines.length ? (
                <div className="transcript">
                  {lines.map((l, i) => {
                    const m = l.match(/^(Speaker \d+|[^:]{1,30}):\s?(.*)$/)
                    return m ? <p key={i}><span className="spk">{m[1]}:</span> {m[2]}</p> : <p key={i}>{l}</p>
                  })}
                </div>
              ) : r.status === 'done' ? (
                <p className="faint" style={{ fontSize: 12.5 }}>Transcript erased after your retention period. Summary and memories remain.</p>
              ) : null}
            </details>
          )}
          <div className="row-actions">
            {failed && <button className="btn sm" disabled={busy === 'retry'} onClick={retry}>{busy === 'retry' ? <><Spin /> Retrying</> : 'Retry'}</button>}
            <button className="btn ghost sm danger" onClick={() => setConfirm(true)}>Forget</button>
            {confirm && (
              <div className="err" role="alertdialog" aria-label="Confirm forget" style={{ width: '100%' }}>
                Forget this conversation? Its transcript, its promises and every memory it produced are erased everywhere. This can’t be undone.
                <div className="row-actions">
                  <button className="btn sm danger" autoFocus disabled={busy === 'forget'} onClick={forget}>{busy === 'forget' ? <><Spin /> Forgetting</> : 'Forget it'}</button>
                  <button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button>
                </div>
              </div>
            )}
          </div>
          <ErrBox error={error} />
        </div>
      </div>
    </div>
  )
}
