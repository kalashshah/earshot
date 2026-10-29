'use client'

import { useEffect, useState } from 'react'
import { api, Empty, ErrBox, exportEverything, Head, icons, Loading, Spin } from '@/components/ui'
import { fmtIsoDay, fmtNum, fmtUsd, fmtWhen, isoDay, modelInfo } from '@/lib/format'

type Usage = { day: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }
type Call = { ts: number; model: string; purpose: string; input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number | null }

export default function PrivacyPage() {
  const [usage, setUsage] = useState<Usage[] | null>(null)
  const [calls, setCalls] = useState<Call[] | null>(null)
  const [retention, setRetention] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [traceError, setTraceError] = useState<unknown>(null)
  const [exp, setExp] = useState<{ busy: boolean; msg?: React.ReactNode }>({ busy: false })

  useEffect(() => {
    api<{ usage?: Usage[] }>('/usage?days=14').then((r) => setUsage(r.usage || []), setError)
    api<{ calls?: Call[] }>('/usage/calls?limit=50').then((r) => setCalls(r.calls || []), setTraceError)
    api<{ retention_days?: number }>('/me').then((r) => setRetention(r.retention_days ?? null), () => {})
  }, [])

  async function doExport() {
    setExp({ busy: true })
    try { const name = await exportEverything(); setExp({ busy: false, msg: <div className="note">Downloaded {name} — recordings, promises, briefs and memories.</div> }) }
    catch (e) { setExp({ busy: false, msg: <ErrBox error={e} /> }) }
  }

  return (
    <>
      <Head title="Privacy & cost" sub="What Earshot keeps, for how long, and what it costs to run.">
        <button className="btn" onClick={doExport} disabled={exp.busy}>{exp.busy ? <><Spin /> Exporting</> : 'Export everything'}</button>
      </Head>
      <div aria-live="polite">{exp.msg}</div>
      <div className="pillars">
        <div className="card pillar">{icons.trash}<b>Audio is deleted immediately</b><p>The recording is removed the moment it’s transcribed. Nothing re-listens later.</p></div>
        <div className="card pillar">{icons.shield}<b>Transcripts erased after {retention ?? 30} days</b><p>After that only the short summary and the facts Nemotron kept remain.</p></div>
        <div className="card pillar">{icons.link}<b>Every memory is traceable</b><p>Each fact points to the conversation it came from. Forget a conversation and its memories go with it.</p></div>
      </div>
      <h2 className="group">Running cost · last 14 days</h2>
      {error ? <ErrBox error={error} /> : !usage ? <Loading n={4} /> : !usage.length ? (
        <Empty title="No usage yet"><p>Costs appear here after the first conversation is processed.</p></Empty>
      ) : <Cost usage={usage} />}
      {usage && usage.length > 0 && (
        <>
          <h2 className="group">Model call trace · latest 50</h2>
          {traceError ? <ErrBox error={traceError} /> : !calls ? <Loading n={3} /> : !calls.length ? <div className="note">No model calls recorded yet.</div> : (
            <div className="card tablewrap">
              <table className="trace">
                <thead><tr><th scope="col">When</th><th scope="col">Model</th><th scope="col">Purpose</th><th scope="col">Tokens in / out</th><th scope="col">Latency</th><th scope="col">Cost</th></tr></thead>
                <tbody>
                  {calls.map((c, i) => (
                    <tr key={i}>
                      <td className="muted">{fmtWhen(c.ts)}</td>
                      <td><Swatch color={modelInfo(c.model).color} />{modelInfo(c.model).label}</td>
                      <td><span className="chip">{c.purpose}</span></td>
                      <td>{c.input_tokens || c.output_tokens ? `${fmtNum(c.input_tokens)} / ${fmtNum(c.output_tokens)}` : '—'}</td>
                      <td>{c.latency_ms != null ? (c.latency_ms >= 1000 ? (c.latency_ms / 1000).toFixed(1) + ' s' : Math.round(c.latency_ms) + ' ms') : '—'}</td>
                      <td>{fmtUsd(c.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}

const Swatch = ({ color }: { color: string }) => (
  <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 7, background: color }} />
)

function Cost({ usage }: { usage: Usage[] }) {
  const days = new Map<string, { total: number; by: Record<string, number> }>()
  const models = new Map<string, { calls: number; input: number; output: number; cost: number }>()
  for (const u of usage) {
    const c = Number(u.cost_usd) || 0
    if (!days.has(u.day)) days.set(u.day, { total: 0, by: {} })
    const d = days.get(u.day)!
    d.total += c; d.by[u.model] = (d.by[u.model] || 0) + c
    const m = models.get(u.model) || { calls: 0, input: 0, output: 0, cost: 0 }
    m.calls += Number(u.calls) || 0; m.input += Number(u.input_tokens) || 0; m.output += Number(u.output_tokens) || 0; m.cost += c
    models.set(u.model, m)
  }
  // Fill the 14-day axis so quiet days show as gaps, not missing bars.
  const axis: string[] = [], last = [...days.keys()].sort().at(-1)!
  for (let i = 13; i >= 0; i--) {
    const d = new Date(isoDay(last) - i * 864e5)
    axis.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  const total = [...days.values()].reduce((s, d) => s + d.total, 0)
  const active = days.size, max = Math.max(...[...days.values()].map((d) => d.total), 1e-9)
  const order = [...models.keys()].sort((a, b) => models.get(b)!.cost - models.get(a)!.cost)
  const calls = [...models.values()].reduce((s, m) => s + m.calls, 0)

  return (
    <>
      <div className="kpis">
        <div className="card kpi hero"><div className="v">{fmtUsd(total / active)}</div><div className="l">per active day, on average</div></div>
        <div className="card kpi"><div className="v">{fmtUsd(total)}</div><div className="l">total, {active} active day{active === 1 ? '' : 's'}</div></div>
        <div className="card kpi"><div className="v">{fmtNum(calls)}</div><div className="l">model calls</div></div>
      </div>
      <div className="card chart">
        <div className="bars" role="img" aria-label="Daily cost, last 14 days">
          {axis.map((day) => {
            const d = days.get(day)
            return (
              <div key={day} className="bar" title={`${fmtIsoDay(day)}: ${d ? fmtUsd(d.total) : '$0'}`}>
                {d ? order.filter((m) => d.by[m]).map((m) => <span key={m} style={{ height: `${(d.by[m] / max) * 100}%`, background: modelInfo(m).color }} />)
                  : <span style={{ height: 2, background: 'var(--line)' }} />}
              </div>
            )
          })}
        </div>
        <div className="bar-x" aria-hidden="true">
          {axis.map((d, i) => <span key={d}>{i % 2 === 1 || axis.length < 8 ? new Date(isoDay(d)).getDate() : ''}</span>)}
        </div>
        <div className="legend">{order.map((m) => <span key={m}><i style={{ background: modelInfo(m).color }} />{modelInfo(m).label}</span>)}</div>
      </div>
      <div className="card tablewrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th scope="col">Model</th><th scope="col">Calls</th><th scope="col">Tokens in</th><th scope="col">Tokens out</th><th scope="col">Cost</th></tr></thead>
          <tbody>
            {order.map((m) => {
              const x = models.get(m)!
              return (
                <tr key={m}>
                  <td><Swatch color={modelInfo(m).color} />{modelInfo(m).label}</td>
                  <td>{fmtNum(x.calls)}</td><td>{x.input ? fmtNum(x.input) : '—'}</td><td>{x.output ? fmtNum(x.output) : '—'}</td><td>{fmtUsd(x.cost)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><td>Total</td><td>{fmtNum(calls)}</td><td /><td /><td>{fmtUsd(total)}</td></tr></tfoot>
        </table>
      </div>
      <div className="card tablewrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th scope="col">Day</th>{order.map((m) => <th key={m} scope="col">{modelInfo(m).label.replace('Nemotron ', '')}</th>)}<th scope="col">Total</th></tr></thead>
          <tbody>
            {[...days.keys()].sort().reverse().map((day) => {
              const d = days.get(day)!
              return (
                <tr key={day}>
                  <td>{fmtIsoDay(day)}</td>
                  {order.map((m) => <td key={m} className={d.by[m] ? '' : 'faint'}>{d.by[m] ? fmtUsd(d.by[m]) : '—'}</td>)}
                  <td><b>{fmtUsd(d.total)}</b></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: 12, margin: '10px 0 0' }}>Token Factory list prices; Deepgram Nova-3 billed per audio minute via Workers AI.</p>
    </>
  )
}
