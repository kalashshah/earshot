'use client'
import { useEffect, useRef } from 'react'

// WebGL2 point cloud, ported in spirit from Lifthouse's Metal body: points start scattered,
// spring home with a slight overshoot, then idle while sound ripples travel across the shape.
// Everything after setup runs in the vertex shader, so a frame is one draw call.
// Colors come from --particle-ink / --particle-hot on the canvas, so each theme sets its own.

const VERT = `#version 300 es
in vec3 aHome; in vec3 aScatter; in float aSeed;
uniform float uT, uMorph, uYaw, uPitch, uAspect, uSize, uDisc, uDpr;
uniform vec3 uInk, uHot;
out vec4 vColor;
void main() {
  vec3 p = mix(aScatter, aHome, uMorph);
  float d, wave;
  if (uDisc > .5) {
    d = length(aHome.xz);
    wave = sin(d * 11. - uT * 1.8);
    p.y += .045 * wave * uMorph;
  } else {
    // ripples spread from one point on the sphere, like sound leaving a speaker
    d = acos(clamp(dot(normalize(aHome), normalize(vec3(.55, .45, .7))), -1., 1.));
    wave = sin(d * 7. - uT * 2.);
    p *= 1. + .05 * wave * uMorph;
  }
  p += .012 * vec3(sin(uT * .9 + aSeed * 40.), cos(uT * .7 + aSeed * 23.), sin(uT * .8 + aSeed * 17.));
  float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(p.x, cp * p.y - sp * p.z, sp * p.y + cp * p.z);
  float z = 3.2 - p.z;
  gl_Position = vec4(p.x * 2.6 / uAspect, p.y * 2.6, 0., z);
  float crest = smoothstep(.55, 1., wave) * uMorph;
  float front = smoothstep(-1.2, 1., p.z);
  gl_PointSize = uSize * uDpr * (1. + crest * 1.3) * 3.2 / z;
  vColor = vec4(mix(uInk, uHot, crest), (.18 + .62 * crest + .2 * front) * (.4 + .6 * front));
}`

const FRAG = `#version 300 es
precision mediump float;
in vec4 vColor; out vec4 o;
uniform float uAdd;
void main() {
  float r = length(gl_PointCoord - .5) * 2.;
  if (r > 1.) discard;
  // light backgrounds need denser dots to read; additive glow on dark does that for free
  float a = min(1., vColor.a * smoothstep(1., .35, r) * (uAdd > .5 ? 1. : 1.9));
  o = uAdd > .5 ? vec4(vColor.rgb * a, a) : vec4(vColor.rgb, a);
}`

type Shape = 'sphere' | 'disc'

function build(shape: Shape, n: number) {
  const home = new Float32Array(n * 3), scatter = new Float32Array(n * 3), seed = new Float32Array(n)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    if (shape === 'sphere') {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = golden * i
      home.set([Math.cos(th) * r, y, Math.sin(th) * r], i * 3)
    } else {
      const r = 1.6 * Math.sqrt((i + 0.5) / n), th = golden * i
      home.set([Math.cos(th) * r, 0, Math.sin(th) * r], i * 3)
    }
    scatter.set([(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3], i * 3)
    seed[i] = Math.random()
  }
  return { home, scatter, seed }
}

function rgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i)
  if (!m) return [1, 0.3, 0]
  const v = parseInt(m[1], 16)
  return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

// Ease-out "back": overshoots a touch past 1, then settles (same curve as Lifthouse's intro).
const easeOutBack = (t: number, s = 1.4) => { const u = Math.min(1, Math.max(0, t)) - 1; return 1 + (s + 1) * u * u * u + s * u * u }

export function Particles({ shape = 'sphere', className, pitch = 0.25, size = 2.2 }: { shape?: Shape; className?: string; pitch?: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true })
    if (!gl) return // no WebGL2: the page simply has no particles

    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    // dot count follows the canvas size: a sidebar orb doesn't need the hero's 4k points
    const w = canvas.getBoundingClientRect().width
    const n = Math.round(Math.min(shape === 'sphere' ? 4200 : 3600, Math.max(600, w * 4.5)))
    const data = build(shape, n)
    for (const [name, arr, k] of [['aHome', data.home, 3], ['aScatter', data.scatter, 3], ['aSeed', data.seed, 1]] as const) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, k, gl.FLOAT, false, 0, 0)
    }
    const u = (name: string) => gl.getUniformLocation(prog, name)
    const uni = Object.fromEntries(['uT', 'uMorph', 'uYaw', 'uPitch', 'uAspect', 'uSize', 'uDisc', 'uDpr', 'uInk', 'uHot', 'uAdd'].map((k) => [k, u(k)]))
    gl.enable(gl.BLEND)
    gl.uniform1f(uni.uDisc, shape === 'disc' ? 1 : 0)
    gl.uniform1f(uni.uSize, size)

    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const colors = () => {
      const cs = getComputedStyle(canvas)
      gl.uniform3fv(uni.uInk, rgb(cs.getPropertyValue('--particle-ink')))
      gl.uniform3fv(uni.uHot, rgb(cs.getPropertyValue('--particle-hot')))
      // additive glow on dark backgrounds; plain alpha on light ones, where additive washes out
      gl.uniform1f(uni.uAdd, dark.matches ? 1 : 0)
      if (dark.matches) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    }
    colors()
    dark.addEventListener('change', colors)

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform1f(uni.uAspect, width / Math.max(1, height))
      gl.uniform1f(uni.uDpr, dpr)
    }
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize()

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let mx = 0, my = 0, yawOff = 0, pitchOff = 0
    const move = (e: PointerEvent) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5 }
    window.addEventListener('pointermove', move, { passive: true })

    let raf = 0, visible = false, born = -1
    const t0 = performance.now()
    const frame = (now: number) => {
      const t = (now - t0) / 1000
      if (born < 0) born = t
      yawOff += (mx * 0.6 - yawOff) * 0.04; pitchOff += (my * 0.3 - pitchOff) * 0.04
      gl.uniform1f(uni.uT, still ? 0 : t)
      gl.uniform1f(uni.uMorph, still ? 1 : easeOutBack((t - born) / 1.8))
      gl.uniform1f(uni.uYaw, (still ? 0 : t * 0.12) + yawOff)
      gl.uniform1f(uni.uPitch, pitch + pitchOff)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.POINTS, 0, n)
      if (visible && !still) raf = requestAnimationFrame(frame)
    }
    // only animate while on screen; the morph-in starts the first time it's seen
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      cancelAnimationFrame(raf)
      if (visible) raf = requestAnimationFrame(frame)
    })
    io.observe(canvas)

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect()
      window.removeEventListener('pointermove', move); dark.removeEventListener('change', colors)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [shape, pitch, size])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
