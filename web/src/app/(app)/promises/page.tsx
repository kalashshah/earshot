'use client'

import { useEffect, useRef, useState } from 'react'
import { api, Empty, ErrBox, Head, Loading, refreshCounts } from '@/components/ui'
import { fmtWhen, initials } from '@/lib/format'

type Action = {
  id: string; owner: string; counterpart?: string | null; what: string; due?: string | null; draft?: string | null
  status: string; recording_title?: string | null; recording_started_at?: number | null
}

export default function PromisesPage() {
  const [actions, setActions] = useState<Action[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    api<{ actions?: Action[] }>('/actions?status=open').then((r) => setActions(r.actions || []), setError)
  }, [])

  const gone = (id: string) => { setActions((a) => a!.filter((x) => x.id !== id)); refreshCounts() }

  if (error) return <><Header /><ErrBox error={error} /></>
  if (!actions) return <><Header /><Loading n={4} /></>
  const mine = actions.filter((a) => a.owner === 'you'), theirs = actions.filter((a) => a.owner !== 'you')
  return (
    <>
      <Header />
      {!actions.length ? (
        <Empty title="Nothing outstanding"><p>When someone says “I’ll send that over” — you or them — it shows up here with a drafted follow-up.</p></Empty>
      ) : (
        <>
          <h2 className="group">You owe <span className="n">{mine.length}</span></h2>
          {mine.length ? <div className="card list">{mine.map((a) => <Row key={a.id} a={a} mine onGone={gone} />)}</div> : <div className="note">You’re all caught up.</div>}
          <h2 className="group">Owed to you <span className="n">{theirs.length}</span></h2>
          {theirs.length ? <div className="card list">{theirs.map((a) => <Row key={a.id} a={a} onGone={gone} />)}</div> : <div className="note">Nobody owes you anything right now.</div>}
        </>
      )}
    </>
  )
}

const Header = () => <Head title="Promises" sub="Commitments Nemotron heard you make, and the ones made to you." />

function Meta({ a }: { a: Action }) {
  return (
    <div className="row-meta">
      {a.due && <span className="badge due">Due {a.due}</span>}
      {a.recording_title && <span>From “{a.recording_title}”</span>}
      {a.recording_started_at ? <span>{fmtWhen(a.recording_started_at)}</span> : null}
    </div>
  )
}

function Row({ a, mine, onGone }: { a: Action; mine?: boolean; onGone: (id: string) => void }) {
  const hasDraft = mine && a.draft != null
  const [draft, setDraft] = useState(a.draft ?? '')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const last = useRef(a.draft ?? '')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ta = useRef<HTMLTextAreaElement>(null)

  const patch = async (body: { status?: string; draft?: string }) => {
    try { await api(`/actions/${encodeURIComponent(a.id)}`, { method: 'PATCH', body }); return true }
    catch (e) { setSaved(''); setError(e); return false }
  }
  const save = async (value: string) => {
    clearTimeout(timer.current)
    if (!hasDraft || value === last.current) return
    setSaved('Saving…')
    if (await patch({ draft: value })) { last.current = value; setSaved('Saved') }
  }
  const remove = () => { setLeaving(true); setTimeout(() => onGone(a.id), 250) }
  const finish = async (status: 'done' | 'dismissed') => {
    setError(null); setBusy(true)
    if (await patch({ status, ...(hasDraft && draft !== last.current ? { draft } : {}) })) remove()
    else setBusy(false)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(draft); setSaved('Copied') }
    catch { ta.current?.select(); setSaved('Press ⌘C to copy') }
  }
  const send = async () => {
    setError(null)
    window.location.href = `mailto:?body=${encodeURIComponent(draft)}`
    if (await patch({ status: 'done', draft })) remove()
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className={`row${leaving ? ' leaving' : ''}`}>
      {mine ? (
        <div className="row-top">
          <div className="min-w-0">
            <div className="row-title">{a.what}</div>
            {a.counterpart && <div className="muted" style={{ fontSize: 13 }}>To {a.counterpart}</div>}
            <Meta a={a} />
          </div>
        </div>
      ) : (
        <div className="row-top">
          <span className="who" aria-hidden="true">{initials(a.owner)}</span>
          <div className="min-w-0 flex-1">
            <div className="row-title">{a.owner} <span className="muted" style={{ fontWeight: 400 }}>will</span> {a.what}</div>
            <Meta a={a} />
          </div>
        </div>
      )}
      {hasDraft && (
        <>
          <label className="draft-label" htmlFor={`d-${a.id}`}>Follow-up drafted by Nemotron · edit before sending</label>
          <textarea
            id={`d-${a.id}`} ref={ta} value={draft} rows={Math.min(10, Math.max(3, String(a.draft).split('\n').length + 1))}
            onChange={(e) => { const v = e.target.value; setDraft(v); setSaved(''); clearTimeout(timer.current); timer.current = setTimeout(() => save(v), 900) }}
            onBlur={() => save(draft)}
          />
        </>
      )}
      <div className="row-actions">
        {hasDraft && <><button className="btn primary sm" onClick={send}>Send</button><button className="btn sm" onClick={copy}>Copy</button></>}
        <button className="btn sm" disabled={busy} onClick={() => finish('done')}>{mine ? 'Mark done' : 'Received'}</button>
        <button className="btn ghost sm" disabled={busy} onClick={() => finish('dismissed')}>Dismiss</button>
        <span className="saved" aria-live="polite">{saved}</span>
      </div>
      <ErrBox error={error} />
    </div>
  )
}
