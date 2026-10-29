'use client'

import { useEffect, useMemo, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { api, ErrBox, exportEverything, Head, Loading, Spin } from '@/components/ui'
import { fmtWhen } from '@/lib/format'

type Me = { id: string; name: string; email: string; tz: string; retention_days: number; daily_usd_cap?: number; created_at: number }
type Device = { id: string; name: string; created_at: number; last_seen_at: number | null }
const RETENTION = [7, 30, 90, 365]

export default function SettingsPage() {
  return (
    <>
      <Head title="Settings" sub="Your profile, your paired iPhone and your data." />
      <Profile />
      <Devices />
      <Data />
    </>
  )
}

function Profile() {
  const [me, setMe] = useState<Me | null>(null)
  const [form, setForm] = useState({ name: '', tz: '', retention_days: 30 })
  // Only rendered once /me has loaded, i.e. on the client.
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone'), [])
  const [error, setError] = useState<unknown>(null)
  const [status, setStatus] = useState<'' | 'saving' | 'saved'>('')

  useEffect(() => {
    api<Me>('/me').then((m) => { setMe(m); setForm({ name: m.name || '', tz: m.tz || browserTz, retention_days: m.retention_days || 30 }) }, setError)
  }, [browserTz])

  async function save(patch: Partial<typeof form> = form) {
    setStatus('saving'); setError(null)
    try {
      const m = await api<Me>('/me', { method: 'PATCH', body: patch })
      setMe(m); setForm({ name: m.name || '', tz: m.tz, retention_days: m.retention_days })
      // Keep the sign-in record's name in step; it is what earshot-api is told on each request.
      if (patch.name !== undefined) await authClient.updateUser({ name: m.name }).catch(() => {})
      setStatus('saved')
    } catch (e) { setError(e); setStatus('') }
  }

  if (!me) return <><h2 className="group">Profile</h2>{error ? <ErrBox error={error} /> : <Loading n={3} />}</>
  const dirty = form.name !== (me.name || '') || form.tz !== me.tz || form.retention_days !== me.retention_days
  const zoneList = zones.includes(form.tz) ? zones : [form.tz, ...zones]

  return (
    <>
      <h2 className="group">Profile</h2>
      {browserTz && me.tz && browserTz !== me.tz && (
        <div className="note" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>This browser is in <b>{browserTz}</b>, but briefs are timed for <b>{me.tz}</b>.</span>
          <button className="btn sm" onClick={() => save({ tz: browserTz })}>Use {browserTz}</button>
        </div>
      )}
      <form className="card" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="field">
          <b>What people call you</b>
          <span className="hint">Tells Nemotron which speaker in a conversation is you, so promises land on the right side.</span>
          <input type="text" value={form.name} maxLength={80} autoComplete="name" onChange={(e) => { setForm({ ...form, name: e.target.value }); setStatus('') }} placeholder="e.g. Kalash" />
        </label>
        <label className="field">
          <b>Time zone</b>
          <span className="hint">Your morning brief arrives at 7:00 here, and days in the timeline split at local midnight.</span>
          <select value={form.tz} onChange={(e) => { setForm({ ...form, tz: e.target.value }); setStatus('') }}>
            {zoneList.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="field">
          <b>Keep transcripts for</b>
          <span className="hint">After this, a conversation’s transcript is erased. Its summary and the facts Nemotron kept remain.</span>
          <select value={form.retention_days} onChange={(e) => { setForm({ ...form, retention_days: Number(e.target.value) }); setStatus('') }}>
            {(RETENTION.includes(form.retention_days) ? RETENTION : [...RETENTION, form.retention_days].sort((a, b) => a - b)).map((d) => (
              <option key={d} value={d}>{d === 365 ? '1 year' : `${d} days`}</option>
            ))}
          </select>
        </label>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn primary" type="submit" disabled={!dirty || status === 'saving'}>{status === 'saving' ? <><Spin /> Saving</> : 'Save changes'}</button>
          <span className="faint" style={{ fontSize: 12.5 }} aria-live="polite">{status === 'saved' && !dirty ? 'Saved' : ''}</span>
          <span className="faint" style={{ fontSize: 12.5, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.email}</span>
        </div>
      </form>
      <ErrBox error={error} />
    </>
  )
}

function Devices() {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [pair, setPair] = useState<{ code: string; expires_at: number; known: string[] } | null>(null)
  const [pairing, setPairing] = useState(false)
  const [paired, setPaired] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [removing, setRemoving] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => { api<{ devices?: Device[] }>('/devices').then((r) => setDevices(r.devices || []), setError) }, [])

  // While a code is on screen: tick the countdown, and poll for the phone showing up.
  const expired = pair ? now >= pair.expires_at : false
  useEffect(() => {
    if (!pair || expired) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(async () => {
      try {
        const list = (await api<{ devices?: Device[] }>('/devices')).devices || []
        const added = list.find((d) => !pair.known.includes(d.id))
        if (added) { setDevices(list); setPair(null); setPaired(added.name || 'Your iPhone') }
      } catch {}
    }, 3000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [pair, expired])

  async function start() {
    setPairing(true); setError(null); setPaired('')
    try {
      const r = await api<{ code: string; expires_at: number }>('/devices/pair-code', { method: 'POST', body: {} })
      setNow(Date.now()); setPair({ ...r, known: (devices || []).map((d) => d.id) })
    } catch (e) { setError(e) }
    setPairing(false)
  }
  async function remove(id: string) {
    setBusyId(id); setError(null)
    try { await api(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }); setDevices((d) => d!.filter((x) => x.id !== id)); setRemoving(null) }
    catch (e) { setError(e) }
    setBusyId(null)
  }

  const left = pair ? Math.max(0, Math.ceil((pair.expires_at - now) / 1000)) : 0
  return (
    <>
      <h2 className="group" id="devices">Devices</h2>
      <div className="card list">
        {!devices ? <div className="row">{error ? null : <Loading n={2} />}</div> : !devices.length ? (
          <div className="row muted">No iPhone paired yet. Earshot on your Apple Watch records through it.</div>
        ) : devices.map((d) => (
          <div key={d.id} className="row">
            <div className="row-top">
              <div className="min-w-0">
                <div className="row-title">{d.name || 'iPhone'}</div>
                <div className="row-meta"><span>{d.last_seen_at ? `Last seen ${fmtWhen(d.last_seen_at)}` : 'Not seen yet'}</span><span>Paired {fmtWhen(d.created_at)}</span></div>
              </div>
              {removing !== d.id && <button className="btn ghost sm danger" onClick={() => setRemoving(d.id)}>Remove</button>}
            </div>
            {removing === d.id && (
              <div className="err" role="alertdialog" aria-label="Confirm remove">
                Remove {d.name || 'this iPhone'}? It stops uploading until you pair it again. Conversations already recorded stay.
                <div className="row-actions">
                  <button className="btn sm danger" autoFocus disabled={busyId === d.id} onClick={() => remove(d.id)}>{busyId === d.id ? <><Spin /> Removing</> : 'Remove'}</button>
                  <button className="btn ghost sm" onClick={() => setRemoving(null)}>Keep</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div className="row">
          {pair && !expired ? (
            <div style={{ textAlign: 'center' }}>
              <div className="muted">Open Earshot on your iPhone → <b>Pair</b> → enter this code</div>
              <div className="paircode" aria-live="off">{pair.code}</div>
              <div className="faint tnum" style={{ fontSize: 12.5 }}><Spin /> Waiting for your iPhone · expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
              <div className="row-actions" style={{ justifyContent: 'center' }}><button className="btn ghost sm" onClick={() => setPair(null)}>Cancel</button></div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="muted" style={{ flex: 1, minWidth: 200 }}>{pair && expired ? 'That code expired.' : 'Pairing takes a minute. You need the Earshot app on your iPhone.'}</span>
              <button className="btn primary" disabled={pairing} onClick={start}>{pairing ? <><Spin /> Getting a code</> : pair && expired ? 'Get a new code' : 'Pair your iPhone'}</button>
            </div>
          )}
        </div>
      </div>
      {paired && <div className="ok" role="status">{paired} is paired. Recordings from your watch will show up in Timeline.</div>}
      <ErrBox error={error} />
    </>
  )
}

function Data() {
  const [exp, setExp] = useState<{ busy: boolean; msg?: React.ReactNode }>({ busy: false })
  const [confirm, setConfirm] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function doExport() {
    setExp({ busy: true })
    try { const name = await exportEverything(); setExp({ busy: false, msg: <div className="note">Downloaded {name} — recordings, promises, briefs and memories.</div> }) }
    catch (e) { setExp({ busy: false, msg: <ErrBox error={e} /> }) }
  }
  async function deleteAccount() {
    setBusy(true); setError('')
    // The server erases everything in earshot-api first (beforeDelete in auth.ts), then the account.
    const { error } = await authClient.deleteUser().catch(() => ({ error: { message: 'Could not reach Earshot.', code: '' } }))
    if (!error) { window.location.href = '/sign-in'; return }
    setBusy(false)
    setError(error.code === 'SESSION_EXPIRED' ? 'For your safety, sign out and back in, then delete your account.' : error.message || 'Could not delete your account.')
  }

  return (
    <>
      <h2 className="group">Data</h2>
      <div className="card">
        <div className="field" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}><b style={{ fontWeight: 600 }}>Export everything</b><span className="hint" style={{ margin: '2px 0 0' }}>One JSON file: recordings, promises, briefs and memories.</span></div>
          <button className="btn" onClick={doExport} disabled={exp.busy}>{exp.busy ? <><Spin /> Exporting</> : 'Export'}</button>
        </div>
        <div className="field">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}><b style={{ fontWeight: 600 }}>Delete account</b><span className="hint" style={{ margin: '2px 0 0' }}>Erases every recording, promise, brief, memory and paired device, then your account.</span></div>
            {!asking && <button className="btn danger" onClick={() => setAsking(true)}>Delete account</button>}
          </div>
          {asking && (
            <form className="err" onSubmit={(e) => { e.preventDefault(); if (confirm === 'DELETE') deleteAccount() }}>
              <label htmlFor="confirm-delete">This can’t be undone. Type <b>DELETE</b> to confirm.</label>
              <input id="confirm-delete" type="text" autoComplete="off" autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ marginTop: 8 }} />
              <div className="row-actions">
                <button className="btn sm danger" type="submit" disabled={confirm !== 'DELETE' || busy}>{busy ? <><Spin /> Deleting</> : 'Delete everything'}</button>
                <button className="btn ghost sm" type="button" onClick={() => { setAsking(false); setConfirm(''); setError('') }}>Cancel</button>
              </div>
              {error && <p style={{ margin: '8px 0 0' }}>{error}</p>}
            </form>
          )}
        </div>
      </div>
      <div aria-live="polite">{exp.msg}</div>
    </>
  )
}
