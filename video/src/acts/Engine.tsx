import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Orb } from '../brand/Orb';
import { C, typeStyle, U } from '../brand/tokens';
import { MODELS, PIPE, TAVILY } from '../data';
import { Roll } from '../fx/Roll';
import { Caption, STAGE } from '../kit';
import { clamp, E, mix, prog, spr, SPR } from '../lib/anim';
import { camera, lc } from '../lib/camera';
import { mixColor } from '../lib/color';
import { ACT, BEAT, copy, CUE, f60, FPS, H, W } from '../timeline';

// ACT 6 - under the hood. The pipeline builds left to right on the beat: watch, Deepgram, Nemotron
// (opening into its three models, each lit on the word that names it), MemoryHQ, with Tavily
// feeding Nemotron from above. Each node springs in and draws its own border; the wires draw on,
// then clips (accent packets: the live signal) keep flowing through them. The diagram turns to
// face the camera as it builds, then clears for the eval numbers, which roll in on their words.

const L = (abs: number) => abs - ACT.engine.from;
const Y = 660 * U;
const XS = [250, 720, 1200, 1680].map((x) => x * U);
const NODE = { w: 360 * U, h: 150 * U };
const LLM = { h: 370 * U };
const TAV_Y = Y - 330 * U;
const born = (i: number) => L(CUE.pipe) + i * BEAT;
const CLEAR = L(CUE.engineClear);
const FLOW = born(3) + f60(40); // the wire is whole: clips start flowing
const NOTES = ['40 questions about a staged day', 'Nemotron Super, per answer', 'who said what, same eval'];

/** A node: springs up into place while its border draws on around it. */
const Node: React.FC<{ x: number; y?: number; name: string; sub: string; at: number; f: number; h?: number; edge?: string; children?: React.ReactNode }> = ({
  x,
  y = Y,
  name,
  sub,
  at,
  f,
  h = NODE.h,
  edge = C.line2,
  children,
}) => {
  const s = spr(f, at, SPR.firm);
  const draw = prog(f, at, at + f60(40), E.outSoft);
  const fill = prog(f, at + f60(8), at + f60(30), E.smooth);
  const r = 18 * U;
  return (
    <div
      data-ui
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: NODE.w,
        height: h,
        transform: `translate(${(x - NODE.w / 2).toFixed(1)}px, ${(y - h / 2 + (1 - s) * 30 * U).toFixed(1)}px) scale(${mix(0.94, 1, s).toFixed(4)})`,
        opacity: clamp(s * 1.6),
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: r, background: C.ink2, opacity: fill }} />
      <svg width={NODE.w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <rect x={0.75 * U} y={0.75 * U} width={NODE.w - 1.5 * U} height={h - 1.5 * U} rx={r} fill="none" stroke={edge} strokeWidth={1.5 * U} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      </svg>
      <div style={{ position: 'relative', padding: 26 * U, opacity: prog(f, at + f60(10), at + f60(34), E.smooth) }}>
        <div style={{ ...typeStyle('ui', 32 * U), color: C.paper, fontWeight: 600 }}>{name}</div>
        <div style={{ ...typeStyle('ui', 22 * U), color: C.mute, marginTop: 8 * U }}>{sub}</div>
        {children}
      </div>
    </div>
  );
};

/** Clips riding a wire from a to b: `n` packets, one lap every `period` frames, each with a short trail. */
const Packets: React.FC<{ f: number; from: number; a: [number, number]; b: [number, number]; n?: number; period?: number; phase?: number }> = ({ f, from, a, b, n = 3, period = f60(150), phase = 0 }) => {
  if (f < from) return null;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const trail = 70 * U;
  return (
    <>
      {Array.from({ length: n }, (_, j) => {
        const t = ((f - from) / period + j / n + phase) % 1;
        const fade = Math.min(1, t / 0.08, (1 - t) / 0.08) * prog(f, from, from + f60(20), E.smooth);
        const tl = Math.min(trail, t * len);
        return (
          <div key={j} style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${mix(a[0], b[0], t).toFixed(1)}px, ${mix(a[1], b[1], t).toFixed(1)}px) rotate(${ang.toFixed(4)}rad)`, opacity: fade }}>
            <div style={{ position: 'absolute', left: 0, top: -1.5 * U, transform: `translateX(${(-tl).toFixed(1)}px)`, width: tl, height: 3 * U, background: `linear-gradient(90deg, transparent, ${C.accent})` }} />
            <div style={{ position: 'absolute', left: -5 * U, top: -5 * U, width: 10 * U, height: 10 * U, borderRadius: 5 * U, background: C.accent }} />
          </div>
        );
      })}
    </>
  );
};

/** One eval number: the figure rolls on its word, the rest of the line follows, a bar runs to the value. */
const Stat: React.FC<{ f: number; id: 'stat1' | 'stat2' | 'stat3'; note: string }> = ({ f, id, note }) => {
  const c = copy(id);
  const a = L(c.in);
  const leave = prog(f, L(c.out), L(c.out) + f60(24), E.exit);
  if (f < a - 2 || leave >= 1) return null;
  const roll = f60(70);
  const size = 120 * U;
  const rest = c.text.split(' ').slice(1).join(' ');
  // 73% and 80% fill up to their value; the cost bar falls from a whole cent to 0.08 of one
  const [b0, b1] = id === 'stat2' ? [1, 0.08] : [0, id === 'stat1' ? 0.73 : 0.8];
  const bar = mix(b0, b1, prog(f, a, a + roll, E.out));
  const num =
    id === 'stat2' ? (
      <>
        <span>$0.0</span>
        <Roll frame={f} from={100} to={8} start={a} dur={roll} digits={3} pad size={size} role="display" lead={1.15} id="stat2-roll" />
      </>
    ) : (
      <>
        <Roll frame={f} from={0} to={id === 'stat1' ? 73 : 80} start={a} dur={roll} digits={2} size={size} role="display" lead={1.15} id={`${id}-roll`} />
        <span>%</span>
      </>
    );
  const restIn = prog(f, a + f60(16), a + f60(46), E.out);
  const BW = 640 * U;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: (1 - leave) * prog(f, a - 2, a + f60(10), E.smooth), transform: `translateY(${(-26 * U * leave).toFixed(1)}px)`, filter: leave > 0.02 ? `blur(${(leave * 10).toFixed(2)}px)` : undefined }}>
      <div data-text={id} style={{ position: 'absolute', left: 0, top: H / 2 - 150 * U, width: W, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 28 * U }}>
        <span style={{ ...typeStyle('display', size), color: C.paper, display: 'inline-flex', alignItems: 'baseline', lineHeight: 1.15 }}>{num}</span>
        <span style={{ ...typeStyle('line', 64 * U), color: C.mute, opacity: restIn, transform: `translateX(${((1 - restIn) * 24 * U).toFixed(1)}px)`, display: 'inline-block' }}>{rest}</span>
      </div>
      <div style={{ position: 'absolute', left: W / 2 - BW / 2, top: H / 2 + 30 * U, width: BW, height: 4 * U, borderRadius: 2 * U, background: C.line }}>
        <div style={{ width: BW * bar, height: '100%', borderRadius: 2 * U, background: C.paper }} />
      </div>
      <div data-ui style={{ position: 'absolute', left: 0, top: H / 2 + 70 * U, width: W, textAlign: 'center', ...typeStyle('ui', 28 * U), color: C.faint, opacity: prog(f, a + f60(50), a + f60(70), E.smooth) }}>
        {note}
      </div>
    </div>
  );
};

export const Engine: React.FC = () => {
  const f = useCurrentFrame();
  const clear = prog(f, CLEAR, CLEAR + f60(30), E.exit);
  const wire = PIPE.slice(1).map((_, i) => prog(f, born(i) + f60(14), born(i + 1) + f60(10), E.smooth));
  // each model line arrives on the word that names it, lit in the accent, then settles to "active"
  const models = MODELS.map((_, i) => prog(f, L(CUE.models[i]) - f60(3), L(CUE.models[i]) + f60(27), E.outSoft));
  const lit = MODELS.map((_, i) => prog(f, L(CUE.models[i]) + f60(40), L(CUE.models[i]) + f60(110), E.smooth));
  const pulse = Math.max(0, ...CUE.models.map((m) => (f >= L(m) ? Math.exp(-(f - L(m)) / f60(16)) : 0)));
  const tavAt = L(CUE.tavily);
  const tavWire = prog(f, tavAt + f60(10), tavAt + f60(40), E.smooth);
  const llmH = mix(NODE.h, LLM.h, models[0]);
  // the diagram turns to face the camera as it builds, square on once the last model has landed
  const turn = prog(f, born(0), L(CUE.models[2]) + f60(60), E.smooth);
  const cam = lc({ ax: W / 2, ay: H / 2, sx: W / 2, sy: H / 2, k: 0.9, yaw: -14, pitch: 7 }, { ax: W / 2, ay: H / 2, sx: W / 2, sy: H / 2, k: 1, yaw: 0, pitch: 0 }, turn);
  const right = (i: number) => [XS[i] + NODE.w / 2, Y] as [number, number];
  const left = (i: number) => [XS[i] - NODE.w / 2, Y] as [number, number];
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - clear, transform: `translateY(${(-40 * U * clear).toFixed(1)}px)`, filter: clear > 0.02 ? `blur(${(clear * 8).toFixed(2)}px)` : undefined }}>
        <div style={camera(cam)}>
          <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            {wire.map((p, i) => (
              <line key={i} x1={right(i)[0]} y1={Y} x2={mix(right(i)[0], left(i + 1)[0], p)} y2={Y} stroke={C.line2} strokeWidth={2 * U} opacity={p > 0 ? 1 : 0} />
            ))}
            <line x1={XS[2]} y1={TAV_Y + NODE.h / 2} x2={XS[2]} y2={mix(TAV_Y + NODE.h / 2, Y - llmH / 2, tavWire)} stroke={C.line2} strokeWidth={2 * U} opacity={tavWire > 0 ? 1 : 0} />
          </svg>
          {[0, 1, 2].map((i) => (
            <Packets key={i} f={f} from={FLOW} a={right(i)} b={left(i + 1)} period={f60(110)} n={2} phase={i * 0.33} />
          ))}
          <Packets f={f} from={tavAt + f60(50)} a={[XS[2], TAV_Y + NODE.h / 2]} b={[XS[2], Y - llmH / 2]} n={1} period={f60(90)} />
          {PIPE.map((n, i) => (
            <Node key={n.id} f={f} at={born(i)} x={XS[i]} name={n.name} sub={n.sub} h={n.id === 'llm' ? llmH : NODE.h} edge={n.id === 'llm' ? mixColor(C.line2, C.accent, pulse * 0.8) : C.line2}>
              {n.id === 'llm' &&
                MODELS.map((m, j) => (
                  <div
                    key={m.name}
                    style={{
                      position: 'relative',
                      opacity: models[j],
                      marginTop: 16 * U,
                      paddingLeft: 16 * U,
                      transform: `translateX(${((1 - models[j]) * 16 * U).toFixed(1)}px) scale(${mix(1.05, 1, lit[j]).toFixed(4)})`,
                      transformOrigin: '0 50%',
                    }}
                  >
                    <div style={{ position: 'absolute', left: 0, top: 3 * U, bottom: 3 * U, width: 3 * U, borderRadius: 2 * U, background: mixColor(C.accent, C.line2, lit[j]), transform: `scaleY(${models[j].toFixed(3)})` }} />
                    <div style={{ ...typeStyle('ui', 24 * U), color: C.paper }}>{m.name}</div>
                    <div style={{ ...typeStyle('ui', 20 * U), color: C.faint }}>{m.job}</div>
                  </div>
                ))}
            </Node>
          ))}
          <Node f={f} at={tavAt} x={XS[2]} y={TAV_Y} name={TAVILY.name} sub={TAVILY.sub} />
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${(XS[0] - 70 * U).toFixed(1)}px, ${(Y - 300 * U).toFixed(1)}px)`, opacity: prog(f, born(0), born(0) + f60(30), E.smooth) }}>
            <Orb size={140 * U} t={f / FPS} level={0.4} />
          </div>
        </div>
        <Caption chain="engine" f={f} from={ACT.engine.from} />
      </div>
      {(['stat1', 'stat2', 'stat3'] as const).map((id, i) => (
        <Stat key={id} f={f} id={id} note={NOTES[i]} />
      ))}
    </AbsoluteFill>
  );
};
