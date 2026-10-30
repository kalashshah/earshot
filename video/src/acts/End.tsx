import React from 'react';
import { STAGE } from '../kit';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Orb } from '../brand/Orb';
import { C, TYPE, typeStyle, U } from '../brand/tokens';
import { Words } from '../fx/Words';
import { E, lmix, mix, prog } from '../lib/anim';
import { measureTracked } from '../lib/measure';
import { ACT, copy, CUE, f60, FPS, H, W } from '../timeline';

// ACT 8 - the orb gathers from scattered dots into the sphere (the app's own intro), then slides
// left as the name locks beside it. The URL arrives last, and the frame keeps pushing to the end.

const L = (abs: number) => abs - ACT.end.from;
const NAME = copy('wordmark');
const URL = copy('url');
const SIZE = 150 * U;
const ORB = 220 * U;

export const End: React.FC = () => {
  const f = useCurrentFrame();
  const gather = prog(f, L(CUE.gather), L(CUE.gather) + f60(110), E.outSoft);
  const slide = prog(f, L(NAME.in), L(NAME.resolved), E.inOut);
  const nameW = measureTracked(NAME.text, SIZE, 700, -0.03);
  const total = ORB * 0.82 + 30 * U + nameW;
  const left = W / 2 - total / 2;
  const orbX = mix(W / 2 - ORB / 2, left - ORB * 0.09, slide);
  const k = lmix(1, 1.08, prog(f, L(NAME.resolved), ACT.end.dur, E.linear));
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${k})`, transformOrigin: `${W / 2}px ${H / 2}px` }}>
        <Orb size={ORB} t={f / FPS} morph={gather} level={0.25} style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${orbX.toFixed(1)}px, ${(H / 2 - ORB / 2 - 30 * U).toFixed(1)}px)` }} />
        <div style={{ position: 'absolute', left: left + ORB * 0.82 + 30 * U, top: H / 2 - SIZE * 0.62 - 30 * U, opacity: slide, clipPath: `inset(-20% ${((1 - slide) * 100).toFixed(2)}% -20% 0)` }}>
          <span data-text="wordmark" style={{ ...typeStyle('display', SIZE), fontWeight: 700, letterSpacing: '-0.03em', color: C.paper }}>
            {NAME.text}
          </span>
        </div>
        <div style={{ position: 'absolute', left: 0, top: H / 2 + 130 * U, width: W, display: 'flex', justifyContent: 'center' }}>
          <Words id="url" text={URL.text} frame={f + ACT.end.from} start={URL.in} size={TYPE.secondary.size * U} style={{ ...typeStyle('secondary'), color: C.mute }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
