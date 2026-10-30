import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, typeStyle, U } from '../brand/tokens';
import { CALL, KEY_WORD } from '../data';
import { Device, SCREEN, STAGE } from '../kit';
import { E, lmix, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { mixColor } from '../lib/color';
import wave from '../callwave.json';
import { ACT, CALL_CAPTURE_LEAD, CUE, f60, FPS, H, W } from '../timeline';

// ACT 1 - Dad's call, heard by the watch. Frame 0 is the watch already capturing (the real app,
// recorded in the simulator while call.mp3 played) with the transcript running under it, one line
// at a time. When Dad names Andrew Chen the name lights in the accent: that is what Earshot heard.
// Then the camera pulls off the watch while she says the name didn't stick. The call's own
// loudness (src/callwave.json, scripts/callwave.py) runs out of both sides of the watch as bars,
// newest at the case, so the sound visibly reaches it; a chip names who is talking.

const L = (abs: number) => abs - ACT.call.from;
const SC = 2.3; // watch screen points -> px
const WS = SCREEN.watch;
export const WATCH = { x: W / 2 - (WS.w * SC) / 2, y: 150 * U };
/** "Andrew Chen" in call.mp3, seconds (measured on src/callwave.json in the full take, then moved with the cut in public/audio). */
const KEY = { from: 7.78, to: 8.35 };
const BARS = 30; // per side
const GAP = 17 * U; // bar pitch
const LAG = 3; // frames of history per bar: the sound travels outward
const level = (fr: number) => (fr >= 0 && fr < wave.length ? wave[fr] : 0);

/** The call's loudness running out of both sides of the watch, mirrored, tapering with distance. */
const Wave: React.FC<{ f: number; fade: number }> = ({ f, fade }) => {
  const cy = WATCH.y + (WS.h * SC) / 2;
  const inner = (WS.w * SC) / 2 + 120 * U; // clear of the case and crown
  return (
    <>
      {Array.from({ length: BARS }, (_, i) => {
        const fr = f - i * LAG;
        const v = level(fr);
        const taper = (1 - i / BARS) ** 0.8;
        const h = 6 * U + v * 220 * U * taper;
        const draw = prog(f, i * 1.5, i * 1.5 + f60(24), E.outSoft); // the opening: bars draw outward
        const hot = fr / FPS >= KEY.from && fr / FPS < KEY.to;
        const col = hot ? C.accent : mixColor(C.faint, C.paper, Math.min(1, v * 1.4));
        return [-1, 1].map((side) => (
          <div
            key={`${i}${side}`}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 6 * U,
              height: h,
              borderRadius: 3 * U,
              background: col,
              opacity: fade * draw * (0.35 + 0.65 * taper),
              transform: `translate(${(W / 2 + side * (inner + i * GAP) - 3 * U).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px)`,
            }}
          />
        ));
      })}
    </>
  );
};

/** The name as the watch hears it: it lifts into an accent-outlined pill, then a small tick lands: kept. */
const Key: React.FC<{ f: number }> = ({ f }) => {
  const lit = prog(f, Math.round(KEY.from * FPS), Math.round(KEY.from * FPS) + f60(18), E.out);
  const tick = prog(f, Math.round(KEY.to * FPS) + f60(10), Math.round(KEY.to * FPS) + f60(34), E.outSoft);
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        padding: `0 ${12 * U}px`,
        margin: `0 ${2 * U}px`,
        borderRadius: 12 * U,
        color: mixColor(C.paper, C.accent, lit),
        background: `rgba(255,90,20,${(0.12 * lit).toFixed(3)})`,
        boxShadow: `inset 0 0 0 ${2 * U}px rgba(255,90,20,${(0.85 * lit).toFixed(3)})`,
        transform: `translateY(${(-5 * U * lit).toFixed(2)}px)`,
      }}
    >
      {KEY_WORD}
      <svg width={30 * U} height={30 * U} viewBox="0 0 30 30" style={{ position: 'absolute', right: -14 * U, top: -16 * U, opacity: tick, transform: `scale(${mix(0.6, 1, tick).toFixed(3)})` }}>
        <circle cx="15" cy="15" r="14" fill={C.accent} />
        <path d="M9 15.5l4 4 8-8.5" fill="none" stroke={C.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="20" strokeDashoffset={(20 * (1 - tick)).toFixed(2)} />
      </svg>
    </span>
  );
};

export const Call: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const pull = prog(f, L(CUE.callEnd), L(CUE.callEnd) + f60(110), E.cam);
  const open = lmix(1.14, 1, prog(f, 0, f60(110), E.outSoft)); // the film opens close on the watch and eases out
  const k = mix(lmix(1, 1.06, prog(f, 0, L(CUE.callEnd), E.linear)) * open, 0.78, pull);
  const yaw = mix(-12, 6, prog(f, 0, L(CUE.callEnd) + f60(110), E.smooth)); // a slow turntable that comes to rest with the pull
  const cam = { ax: W / 2, ay: H / 2, sx: W / 2, sy: mix(H / 2, H / 2 + 70 * U, pull), k, yaw, pitch: 4 };
  const lineIdx = CALL.findIndex((c) => t >= c.start - 0.15 && t < c.end + 0.4);
  const line = lineIdx >= 0 ? CALL[lineIdx] : null;
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      <div style={camera(cam)}>
        {/* the simulator's clock, "Since" line and the Ask corner show when it was recorded, not the 7:10 am run: cover them */}
        <Device kind="watch" name="call" x={WATCH.x} y={WATCH.y} scale={SC} f={f} at={CALL_CAPTURE_LEAD} covers={[[0, 0, WS.w, 62], [0, 212, WS.w, WS.h - 212]]} />
      </div>
      <Wave f={f} fade={1 - pull} />
      {line && (
        <div
          data-ui
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: W,
            transform: `translate(0px, ${(WATCH.y + WS.h * SC + 70 * U).toFixed(1)}px)`,
            display: 'flex',
            justifyContent: 'center',
            opacity: (1 - pull) * prog(f, Math.round(line.start * FPS) - 6, Math.round(line.start * FPS) + 8, E.smooth),
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 * U }}>
            {/* who is talking: a chip that rises in with each turn */}
            <div
              style={{
                ...typeStyle('ui', 24 * U),
                color: C.paper,
                display: 'flex',
                alignItems: 'center',
                gap: 10 * U,
                padding: `${8 * U}px ${18 * U}px`,
                borderRadius: 40 * U,
                background: C.ink2,
                border: `${1.5 * U}px solid ${C.line2}`,
                transform: `translateY(${((1 - prog(f, Math.round(line.start * FPS) - 6, Math.round(line.start * FPS) + 18, E.outSoft)) * 14 * U).toFixed(1)}px)`,
              }}
            >
              <div style={{ width: 9 * U, height: 9 * U, borderRadius: 5 * U, background: line.who === 'Dad' ? C.mute : C.paper }} />
              {line.who === 'Dad' ? 'Dad, on speaker' : 'You'}
            </div>
            <div style={{ ...typeStyle('ui', 34 * U), whiteSpace: 'normal', maxWidth: 1400 * U, textAlign: 'center', color: C.paper }}>
              {line.text.split(KEY_WORD).map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Key f={f} />}
                  {part}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
