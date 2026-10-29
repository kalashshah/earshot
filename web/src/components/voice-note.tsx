'use client'

import { useEffect, useRef, useState } from 'react'
import { AuthError, ErrBox, Spin } from '@/components/ui'

const MAX_MS = 10 * 60_000
const MAX_BYTES = 50 * 1024 * 1024 // earshot-api's limit

// Deepgram wants a bare type: "audio/webm", not "audio/webm;codecs=opus"; macOS labels .m4a "audio/x-m4a".
const bareType = (t: string) => ({ 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4' } as Record<string, string>)[t.split(';')[0]] ?? (t.split(';')[0] || 'audio/mp4')

const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

function audioDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio(), url = URL.createObjectURL(file)
    const done = (ms: number) => { URL.revokeObjectURL(url); resolve(ms) }
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0)
    a.onerror = () => done(0)
    a.src = url
  })
}

/** PUT /recordings/:id, the same upload the iPhone makes. Returns the new id. */
async function upload(blob: Blob, startedAt: number, durationMs: number) {
  if (blob.size > MAX_BYTES) throw new Error('That file is over 50 MB.')
  const id = crypto.randomUUID()
  const res = await fetch(`/api/earshot/recordings/${id}`, {
    method: 'PUT', body: blob,
    headers: { 'content-type': bareType(blob.type), 'x-started-at': String(startedAt), 'x-duration-ms': String(durationMs) },
  })
  if (res.status === 401) { window.location.href = '/sign-in'; throw new AuthError('Unauthorized') }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `Upload failed (${res.status})`)
  return id
}

/** Record from the browser mic or drop in an audio file; it goes through the same pipeline as the watch. */
export function VoiceNote({ onUploaded }: { onUploaded: (r: { id: string; started_at: number; duration_ms: number }) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const rec = useRef<{ mr: MediaRecorder; startedAt: number; timer: ReturnType<typeof setInterval> } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Leaving the page mid-recording releases the mic.
  useEffect(() => () => { if (rec.current) { clearInterval(rec.current.timer); rec.current.mr.stream.getTracks().forEach((t) => t.stop()) } }, [])

  async function send(blob: Blob, startedAt: number, durationMs: number) {
    setState('uploading')
    try { onUploaded({ id: await upload(blob, startedAt, durationMs), started_at: startedAt, duration_ms: durationMs }) }
    catch (e) { setError(e) }
    setState('idle')
  }

  async function start() {
    setError(null)
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
    catch { setError(new Error('Microphone access was blocked. Allow it in your browser to record.')); return }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks: Blob[] = []
    const startedAt = Date.now()
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    mr.onstop = () => {
      clearInterval(rec.current?.timer); rec.current = null
      stream.getTracks().forEach((t) => t.stop())
      send(new Blob(chunks, { type: mr.mimeType }), startedAt, Date.now() - startedAt)
    }
    mr.start(1000)
    const timer = setInterval(() => {
      const ms = Date.now() - startedAt
      setElapsed(ms)
      if (ms >= MAX_MS && mr.state === 'recording') mr.stop()
    }, 500)
    rec.current = { mr, startedAt, timer }
    setElapsed(0); setState('recording')
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    const durationMs = await audioDuration(file)
    // A voice memo's modified time is when it ended.
    send(file, (file.lastModified || Date.now()) - durationMs, durationMs)
  }

  return (
    <div className="voice-note">
      <div className="row-actions" style={{ margin: 0 }}>
        {state === 'recording' ? (
          <button className="btn primary" onClick={() => rec.current?.mr.stop()}><span className="dot-rec" /> Stop · {clock(elapsed)}</button>
        ) : (
          <button className="btn primary" disabled={state === 'uploading'} onClick={start}>
            {state === 'uploading' ? <><Spin /> Uploading</> : 'Record'}
          </button>
        )}
        <button className="btn" disabled={state !== 'idle'} onClick={() => fileInput.current?.click()}>Upload audio</button>
        <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <ErrBox error={error} />
    </div>
  )
}
