import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { C, typeStyle, U } from '../brand/tokens';
import { Device, SCREEN, STAGE } from '../kit';
import { E, mix, prog } from '../lib/anim';
import { ACT, CUE, FPS, H, VO_AT } from '../timeline';
import vo from '../vo.json';

// ACT 4 - the tour: the watch, the phone, the web, one panel each. The device sits left with its real
// screens changing; on the right, what it does, one line arriving on the word that names it. Panels
// hand over with a 3D whip: the outgoing device swings out left as the next swings in from the right.

const L = (abs: number) => abs - ACT.features.from;
/** Absolute frame of the word in narration clip n (1-based) that starts with `key`. */
const word = (n: number, key: string) => {
  const w = vo[n - 1].words.find((x) => x.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(key));
  if (!w) throw new Error(`Features: no "${key}" in vo${n}`);
  return VO_AT[n - 1] + Math.round(w.s * FPS);
};

type Panel = { from: number; to: number; items: { text: string; at: number }[] };
const END = ACT.features.from + ACT.features.dur;
const P: Panel[] = [
  { from: ACT.features.from, to: CUE.phone, items: [{ text: 'One tap to listen', at: word(5, 'tap') }, { text: 'Ask anything you’ve heard', at: word(5, 'ask') }] },
  {
    from: CUE.phone,
    to: CUE.web,
    items: [
      { text: 'Summary of every conversation', at: word(6, 'summary') },
      { text: 'Transcript, speaker by speaker', at: word(6, 'transcript') },
      { text: 'Reminders for what you promised', at: word(6, 'reminders') },
    ],
  },
  {
    from: CUE.web,
    to: END,
    items: [
      { text: 'Timeline of every conversation', at: word(7, 'timeline') },
      { text: 'Promises, with follow-ups drafted', at: word(7, 'promises') },
      { text: 'A brief every morning', at: word(7, 'brief') },
    ],
  },
];

const LIST_X = 1090 * U;
const ROW = 92 * U;

/** The panel's whip: in from the right turned away, out to the left turned the other way. */
const whip = (f: number, p: Panel, first: boolean, last: boolean): React.CSSProperties => {
  const a = first ? 1 : prog(f, L(p.from), L(p.from) + 30, E.out);
  const z = last ? 0 : prog(f, L(p.to) - 18, L(p.to), E.in);
  const x = mix(420, 0, a) - 520 * z;
  const yaw = mix(-28, 0, a) + 24 * z;
  return { position: 'absolute', inset: 0, opacity: Math.min(a, 1 - z), transform: `perspective(${2200 * U}px) translateX(${(x * U).toFixed(1)}px) rotateY(${yaw.toFixed(2)}deg)` };
};

const List: React.FC<{ f: number; items: Panel['items']; x?: number; size?: number }> = ({ f, items, x = LIST_X, size = 46 * U }) => {
  const cur = items.reduce((n, it, i) => (f >= L(it.at) - 3 ? i : n), -1);
  const top = H / 2 - (items.length * ROW) / 2;
  return (
    <>
      {items.map((it, i) => {
        const on = prog(f, L(it.at) - 3, L(it.at) + 24, E.out);
        if (on <= 0) return null;
        const now = i === cur;
        return (
          <div key={it.text} data-ui style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${x}px, ${(top + i * ROW + (1 - on) * 22 * U).toFixed(1)}px)`, opacity: on, display: 'flex', alignItems: 'center', gap: 26 * U }}>
            <div style={{ width: 12 * U, height: 12 * U, borderRadius: 6 * U, background: now ? C.accent : C.line2 }} />
            <div style={{ ...typeStyle('secondary', size), color: now ? C.paper : C.faint }}>{it.text}</div>
          </div>
        );
      })}
    </>
  );
};

const WS = SCREEN.watch;
const WSC = 2.0;
const PS = SCREEN.phone;
const PSC = 0.95;

export const Features: React.FC = () => {
  const f = useCurrentFrame();
  const [w, ph, web] = P;
  const watchX = 640 * U - (WS.w * WSC) / 2;
  const watchY = H / 2 - (WS.h * WSC) / 2;
  const phoneX = 640 * U - (PS.w * PSC) / 2;
  const phoneY = H / 2 - (PS.h * PSC) / 2;
  // the web-and-app panel: a browser, and the phone standing in front of its right edge
  const BSC = 0.58;
  const bX = 60 * U;
  const bY = H / 2 - (SCREEN.web.h * BSC) / 2 + 20 * U;
  const MSC = 0.7;
  const mX = bX + SCREEN.web.w * BSC - 190 * U;
  const mY = H / 2 - (PS.h * MSC) / 2;
  // a screen swap: the next screen fades in over the last on its word
  const swap = (at: number) => prog(f, L(at) - 6, L(at) + 10, E.smooth);
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      {f < L(w.to) && (
        <div style={whip(f, w, true, false)}>
          <Device kind="watch" name="call" x={watchX} y={watchY} scale={WSC} f={f} at={2} covers={[[0, 0, WS.w, 62], [0, 212, WS.w, WS.h - 212]]} />
          <div style={{ position: 'absolute', inset: 0, opacity: swap(w.items[1].at) }}>
            <Sequence from={L(w.items[1].at) - 6} layout="none">
              <Device kind="watch" name="ask-film" x={watchX} y={watchY} scale={WSC} f={f} at={17} />
            </Sequence>
          </div>
          <List f={f} items={w.items} />
        </div>
      )}
      {f >= L(ph.from) && f < L(ph.to) && (
        <div style={whip(f, ph, false, false)}>
          <Device kind="phone" name="heard-list" x={phoneX} y={phoneY} scale={PSC} f={f} />
          <div style={{ position: 'absolute', inset: 0, opacity: swap(ph.items[0].at) * (1 - swap(ph.items[1].at)) }}>
            <Sequence from={L(ph.items[0].at) - 6} layout="none">
              <Device kind="phone" name="heard" x={phoneX} y={phoneY} scale={PSC} f={f} at={5} />
            </Sequence>
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: swap(ph.items[1].at) }}>
            <Sequence from={L(ph.items[1].at) - 6} layout="none">
              <Device kind="phone" name="heard" x={phoneX} y={phoneY} scale={PSC} f={f} at={11.6} />
            </Sequence>
          </div>
          <List f={f} items={ph.items} />
        </div>
      )}
      {f >= L(web.from) && (
        <div style={whip(f, web, false, true)}>
          {/* the same information on the web and in the app, side by side: the browser behind, the phone in
              front, both swapping to the same page on its word. A negative scroll leaves the phone's status strip black. */}
          {(['timeline', 'promises', 'today'] as const).map((name, i) => {
            const scroll = i === 0 ? prog(f, L(web.from) + 20, L(web.items[1].at), E.dolly) : i === 1 ? prog(f, L(web.items[1].at) + 20, L(web.items[2].at), E.dolly) : 0;
            return (
              <div key={name} style={{ position: 'absolute', inset: 0, opacity: i === 0 ? 1 : swap(web.items[i].at) }}>
                <Device kind="web" name={`web-${name}`} x={bX} y={bY} scale={BSC} f={f} scroll={scroll * 200} />
                <Device kind="phone" name={`m-${name}`} x={mX} y={mY} scale={MSC} f={f} scroll={-54 + scroll * 260} />
              </div>
            );
          })}
          <List f={f} items={web.items} x={mX + PS.w * MSC + 64 * U} size={34 * U} />
        </div>
      )}
    </AbsoluteFill>
  );
};
