import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { C } from './tokens';

// The Earshot orb: a frame-driven port of Shared/ParticleOrb.swift and web/src/components/particles.tsx.
// A sphere of dots that turns slowly while ripples travel across it like sound leaving a speaker;
// `level` (0..1) raises the ripples and lights more dots in the accent. `morph` (0..1) gathers the
// dots home from scattered. Everything is a function of `t` (seconds), so a render is deterministic.

const golden = Math.PI * (3 - Math.sqrt(5));
const rand = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const E = [0.55, 0.45, 0.7];
const EN = Math.hypot(E[0], E[1], E[2]);
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export const Orb: React.FC<{
  size: number; // px box
  t: number; // seconds of orb time
  level?: number;
  morph?: number;
  count?: number;
  dot?: number; // px dot diameter at size 400
  style?: React.CSSProperties;
}> = ({ size, t, level = 0, morph = 1, count = 1400, dot = 4.2, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const pts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const y = 1 - (2 * (i + 0.5)) / count;
        const r = Math.sqrt(1 - y * y);
        const th = golden * i;
        return { home: [Math.cos(th) * r, y, Math.sin(th) * r], scatter: [rand(i, 1) * 4 - 2, rand(i, 2) * 3 - 1.5, rand(i, 3) * 2 - 1] };
      }),
    [count],
  );
  const dpr = 2;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    const radius = size * 0.4;
    const lvl = Math.min(1, Math.max(0, level));
    const amp = 0.03 + 0.06 * lvl;
    const phase = t * (2 + 3 * lvl);
    const yaw = t * 0.25;
    const pitch = 0.3;
    const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    const ink = hex(C.dot);
    const hot = hex(C.accent);
    const m = Math.min(1, Math.max(0, morph));
    const px = (dot * size) / 400;
    for (const { home, scatter: s } of pts) {
      const d = Math.acos(Math.max(-1, Math.min(1, (home[0] * E[0] + home[1] * E[1] + home[2] * E[2]) / EN)));
      const wave = Math.sin(d * 7 - phase);
      const k = 1 + amp * wave;
      let p = [s[0] + (home[0] * k - s[0]) * m, s[1] + (home[1] * k - s[1]) * m, s[2] + (home[2] * k - s[2]) * m];
      p = [cy * p[0] + sy * p[2], p[1], -sy * p[0] + cy * p[2]];
      p = [p[0], cp * p[1] - sp * p[2], sp * p[1] + cp * p[2]];
      const f = 3.2 / (3.2 - p[2]);
      const crest = Math.max(0, (wave - 0.55) / 0.45) * (0.35 + 0.65 * lvl) * m;
      const front = Math.max(0, Math.min(1, (p[2] + 1.2) / 2.2));
      const alpha = Math.min(1, (0.2 + 0.7 * crest + 0.25 * front) * (0.4 + 0.6 * front));
      // grey or accent outright: a blend of the two reads as muddy brown
      const c = crest > 0.12 ? hot : ink;
      const sz = px * (1 + crest * 1.3) * f;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
      ctx.beginPath();
      ctx.arc(size / 2 + p[0] * radius * f, size / 2 - p[1] * radius * f, sz / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return <canvas ref={ref} width={size * dpr} height={size * dpr} style={{ width: size, height: size, display: 'block', ...style }} />;
};
