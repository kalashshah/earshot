import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Orb } from '../brand/Orb';
import { C, typeStyle, U } from '../brand/tokens';
import { Roll } from '../fx/Roll';
import { STAGE } from '../kit';
import { E, mix, prog, rand } from '../lib/anim';
import { mixColor } from '../lib/color';
import { camera } from '../lib/camera';
import { ACT, CUE, f60, FPS, H, W } from '../timeline';
import data from '../brain.json';

// ACT 5 - the memory underneath, from the real account. A Sunday of conversations pours into the
// orb, facts burst out into clusters by person and topic, a fact heard twice merges into one,
// overnight research attaches to the people in it, the promises pull out with their drafted
// follow-ups, and the day lands as numbers. Every string is from the account (src/brain.json).
// Around the chips the rest of the memory grows as a linked network, one node per real item: the 13
// conversations ring the orb, the other 29 of the 50 facts and 19 of the 25 overnight research items
// hang off their person or topic, and the real cross-links (the same conversation, the same person)
// join the clusters. At the tally the camera pulls back and the whole network is seen at once.

const L = (abs: number) => abs - ACT.brain.from;
const O = { x: W / 2, y: 540 * U }; // the orb, in world px
const ORB = 270 * U;
const ROW = 37 * U; // chip pitch in a cluster column
const COLW = 330 * U;
const DUR = ACT.brain.dur;

type Cluster = { hub: string; x: number; y: number; facts: string[]; research?: string[][]; dupe?: number };
const CL = data.clusters as Cluster[];

const hubPt = (c: Cluster) => ({ x: c.x * U - COLW / 2 + 5 * U, y: c.y * U + 12 * U });
const FACT_DOTS = [5, 4, 5, 5, 5, 5]; // the facts not shown as chips: 29 + 21 chips = 50
const NEWS_DOTS = [5, 9, 5, 0, 0, 0]; // research not shown as chips: 19 + 6 chips = 25, on the people it was about
/** One node per remaining real memory, fanned out beyond its hub (seeded, so every render agrees). */
const NET = CL.flatMap((c, i) => {
  const h = hubPt(c);
  const base = Math.atan2(h.y - O.y, h.x - O.x);
  return Array.from({ length: FACT_DOTS[i] + NEWS_DOTS[i] }, (_, j) => {
    const ang = base + (rand(`a${i}.${j}`) - 0.5) * 2.1;
    const d = (230 + rand(`d${i}.${j}`) * 420) * U;
    return { x: h.x + Math.cos(ang) * d, y: h.y + Math.sin(ang) * d, h, news: j >= FACT_DOTS[i], j: j >= FACT_DOTS[i] ? j - FACT_DOTS[i] : j, i };
  });
});
// clusters that share a conversation or a person in the account: the call names Andrew Chen; Ashish
// and the fair come from the same Sunday conversation; the class and the laptop trouble too
const LINKS: [number, number][] = [[0, 1], [2, 4], [3, 5]];
const bez = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (a.y < O.y ? -150 : 150) * U });
const onBez = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => {
  const m = bez(a, b);
  return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * m.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * m.y + t * t * b.y };
};

const chip = (accent: boolean): React.CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  height: 31 * U,
  padding: `0 ${12 * U}px`,
  display: 'flex',
  alignItems: 'center',
  gap: 8 * U,
  borderRadius: 8 * U,
  background: C.ink2,
  border: `${1.2 * U}px solid ${accent ? C.accent : C.line2}`,
  boxSizing: 'border-box',
  ...typeStyle('ui', 18 * U),
  color: C.paper,
});

const Tick: React.FC<{ p: number; size?: number }> = ({ p, size = 14 * U }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" style={{ flex: 'none' }}>
    <path d="M2.5 7.5 L5.8 10.5 L11.5 3.8" fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${p} 1`} />
  </svg>
);

export const Brain: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const inP = prog(f, L(CUE.brainIn) - f60(20), L(CUE.brainIn) + f60(40), E.out);
  const day = L(CUE.heardDay);
  const facts = L(CUE.facts);
  const merge = prog(f, L(CUE.merge), L(CUE.merge) + f60(30), E.inOut);
  const research = L(CUE.research);
  const prom = prog(f, L(CUE.promises), L(CUE.promises) + f60(50), E.inOut);
  const tally = prog(f, L(CUE.tally), L(CUE.tally) + f60(40), E.inOut);
  // conversations reaching the orb pump its level; it settles once the day is in
  const absorb = prog(f, day, day + f60(60), E.out) * (1 - prog(f, facts, facts + f60(60), E.smooth));
  const cam = {
    ax: mix(W / 2, W / 2 + 230 * U, prom),
    ay: H / 2,
    sx: W / 2,
    sy: H / 2 - 70 * U * tally,
    k: mix(0.98, 1.03, prog(f, 0, DUR, E.linear)) * mix(1, 0.62, tally),
    yaw: mix(-7, 3, prog(f, 0, L(CUE.tally), E.smooth)),
    pitch: mix(4, 0, prog(f, 0, L(CUE.tally), E.smooth)),
  };
  const dim = 1 - 0.45 * tally;
  const grow = (k: number, n: number) => facts + f60(50) + (k / n) * (L(CUE.promises) - facts - f60(50)); // facts keep arriving until the promises

  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      <div style={{ ...camera(cam), opacity: dim }}>
        {/* the network: conversation nodes ring the orb, the rest of the memories and research hang off their hubs, cross-links between clusters */}
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={W} height={H}>
          {data.conversations.map((_, i) => {
            const land = day - f60(40) + i * f60(11) + f60(80);
            const p = prog(f, land, land + f60(30), E.out);
            if (p <= 0) return null;
            const a = (i / data.conversations.length) * Math.PI * 2 - Math.PI / 2;
            const R = 205 * U;
            const x = O.x + Math.cos(a) * R;
            const y = O.y + Math.sin(a) * R;
            return (
              <g key={`c${i}`} opacity={p}>
                <line x1={O.x + Math.cos(a) * R * 0.55} y1={O.y + Math.sin(a) * R * 0.55} x2={mix(O.x, x, p)} y2={mix(O.y, y, p)} stroke={C.line2} strokeWidth={U} />
                <circle cx={x} cy={y} r={5 * U * (1 + tally)} fill={mixColor(C.accent, C.mute, prog(f, land + f60(20), land + f60(80), E.smooth))} />
              </g>
            );
          })}
          {NET.map((d, k) => {
            const start = d.news ? research + d.i * f60(6) + d.j * f60(9) : grow(k, NET.length);
            const p = prog(f, start, start + f60(40), E.out);
            if (p <= 0) return null;
            const fresh = 1 - prog(f, start + f60(30), start + f60(90), E.smooth);
            const x = mix(d.h.x, d.x, p);
            const y = mix(d.h.y, d.y, p);
            return (
              <g key={`n${k}`}>
                <line x1={d.h.x} y1={d.h.y} x2={x} y2={y} stroke={C.line2} strokeWidth={U * (1 + tally)} opacity={0.7} />
                {d.news ? (
                  <circle cx={x} cy={y} r={6 * U * (1 + tally)} fill={C.ink} stroke={mixColor(C.mute, C.accent, d.news ? Math.max(fresh, 0.55) : fresh)} strokeWidth={1.6 * U} />
                ) : (
                  <circle cx={x} cy={y} r={4.5 * U * (1 + tally)} fill={mixColor(C.mute, C.accent, fresh)} />
                )}
              </g>
            );
          })}
          {LINKS.map(([a, b], i) => {
            const A = hubPt(CL[a]);
            const B = hubPt(CL[b]);
            const m = bez(A, B);
            const p = prog(f, L(CUE.merge) - f60(30) + i * f60(10), L(CUE.merge) + f60(30) + i * f60(10), E.inOut);
            if (p <= 0) return null;
            // a soft pulse runs each link on "merges", and again on "researches"
            const pulses = [L(CUE.merge), research].map((at0) => prog(f, at0 + i * f60(8), at0 + i * f60(8) + f60(50), E.inOut)).filter((q) => q > 0 && q < 1);
            return (
              <g key={`l${i}`}>
                <path d={`M${A.x},${A.y} Q${m.x},${m.y} ${B.x},${B.y}`} fill="none" stroke={C.mute} strokeWidth={1.3 * U * (1 + tally)} strokeDasharray={`${4 * U} ${5 * U}`} opacity={0.8 * p} />
                {pulses.map((q, n) => {
                  const pt = onBez(A, B, q);
                  return <circle key={n} cx={pt.x} cy={pt.y} r={5 * U} fill={C.accent} opacity={Math.sin(Math.PI * q)} />;
                })}
              </g>
            );
          })}
        </svg>

        {/* spokes from the orb to each cluster, drawn as the facts burst out */}
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={W} height={H}>
          {CL.map((c, i) => {
            const p = prog(f, facts + i * f60(5), facts + i * f60(5) + f60(40), E.out);
            const hx = c.x * U;
            const hy = (c.y + 14) * U;
            const ty = hy < O.y ? hy + 12 * U : hy - 12 * U;
            return <line key={c.hub} x1={O.x} y1={O.y} x2={mix(O.x, hx, p)} y2={mix(O.y, ty, p)} stroke={C.line2} strokeWidth={1.4 * U} opacity={p} />;
          })}
        </svg>

        {/* the clusters: a hub label, a spine, and the facts stacked on it */}
        {CL.map((c, i) => {
          const at = facts + i * f60(5);
          const hp = prog(f, at, at + f60(30), E.out);
          if (hp <= 0) return null;
          const left = c.x * U - COLW / 2;
          const top = c.y * U;
          const rows = [...c.facts.map((s, j) => ({ s, kind: 'fact' as const, j })), ...(c.research ?? []).map((r, j) => ({ s: r[0], dom: r[1], kind: 'news' as const, j }))];
          let y = 0;
          return (
            <div key={c.hub}>
              <div data-ui style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${left}px, ${top + (1 - hp) * 10 * U}px)`, opacity: hp, display: 'flex', alignItems: 'center', gap: 10 * U, ...typeStyle('ui', 20 * U), fontWeight: 600, color: C.paper }}>
                <div style={{ width: 10 * U, height: 10 * U, borderRadius: 5 * U, background: C.paper }} />
                {c.hub}
              </div>
              {rows.map((r, k) => {
                const isDupe = r.kind === 'fact' && c.dupe === r.j;
                const isTarget = r.kind === 'fact' && c.dupe !== undefined && r.j === c.dupe - 1;
                const start = r.kind === 'fact' ? at + f60(10) + r.j * f60(7) : research + i * f60(6) + r.j * f60(10);
                const p = prog(f, start, start + f60(26), E.out);
                const rowY = top + 38 * U + y;
                // the duplicate slides up into the fact it repeats, and its row closes behind it
                const slot = isDupe ? ROW * (1 - merge) : ROW;
                y += slot;
                if (p <= 0) return null;
                const news = r.kind === 'news';
                const fresh = news ? 1 : 1 - prog(f, start + f60(30), start + f60(70), E.smooth);
                return (
                  <React.Fragment key={k}>
                    <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${left + 4 * U}px, ${rowY - (isDupe ? ROW * merge : 0) - 4 * U}px)`, width: 1.4 * U, height: ROW, background: C.line2, opacity: p * (isDupe ? 1 - merge : 1) }} />
                    <div
                      data-ui
                      style={{
                        ...chip(news || (fresh > 0.5 && !isDupe) || (isTarget && merge > 0 && merge < 1)),
                        transform: `translate(${left + 18 * U + (1 - p) * -14 * U}px, ${rowY - (isDupe ? ROW * merge : 0)}px)`,
                        opacity: p * (isDupe ? 1 - merge : 1),
                      }}
                    >
                      {r.s}
                      {news && <span style={{ color: C.faint, ...typeStyle('ui', 14 * U) }}>{r.dom}</span>}
                      {isTarget && merge > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 * U, color: C.accent, ...typeStyle('ui', 14 * U), opacity: 1 - prog(f, L(CUE.merge) + f60(110), L(CUE.merge) + f60(140), E.smooth) }}>
                          <Tick p={merge} />
                          merged
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })}

        {/* the orb: the memory itself */}
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${O.x - ORB / 2}px, ${O.y - ORB / 2}px) scale(${mix(0.6, 1, inP) * (1 + 0.06 * absorb)})`, opacity: inP }}>
          <Orb size={ORB} t={t} level={0.25 + 0.55 * absorb} />
        </div>

        {/* a Sunday of conversations streams in from the left and into the orb */}
        {data.conversations.map(([title, min], i) => {
          const s = day - f60(40) + i * f60(11);
          const p = prog(f, s, s + f60(100), E.contact);
          if (p <= 0 || p >= 1) return null;
          const lane = (((i * 5) % 9) - 4) * 95 * U;
          const x = mix(-260 * U, O.x, p);
          const y = mix(O.y + lane, O.y, p * p);
          const k = mix(1, 0.25, p * p);
          return (
            <div
              key={i}
              data-ui
              style={{
                ...chip(false),
                height: 50 * U,
                padding: `0 ${16 * U}px`,
                ...typeStyle('ui', 22 * U),
                color: C.paper,
                transform: `translate(${(x - 180 * U).toFixed(1)}px, ${(y - 22 * U).toFixed(1)}px) scale(${k.toFixed(3)})`,
                transformOrigin: '100% 50%',
                opacity: Math.min(1, p * 6) * (1 - prog(p, 0.8, 1, E.linear)),
              }}
            >
              {title}
              <span style={{ color: C.faint }}>{`${min} min`}</span>
            </div>
          );
        })}
      </div>

      {/* the running count, top left */}
      <div style={{ position: 'absolute', left: 80 * U, top: 70 * U, opacity: prog(f, day - f60(20), day + f60(10), E.out) * (1 - prom), display: 'flex', flexDirection: 'column', gap: 6 * U }}>
        {[
          { to: 13, start: day, dur: f60(200), label: 'conversations' },
          { to: 94, start: day, dur: f60(200), label: 'minutes heard' },
          { to: 50, start: facts, dur: L(CUE.promises) - facts, label: 'memories', plus: true },
          { to: 25, start: research, dur: f60(140), label: 'researched overnight' },
        ].map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', gap: 12 * U, opacity: prog(f, r.start - f60(10), r.start + f60(10), E.out) }}>
            <Roll frame={f} from={0} to={r.to} start={r.start} dur={r.dur} digits={2} id={`brain-${r.label}`} size={44 * U} style={{ color: C.paper }} />
            {r.plus && <span style={{ ...typeStyle('ui', 30 * U), color: C.paper, marginLeft: -8 * U }}>+</span>}
            <span style={{ ...typeStyle('ui', 22 * U), color: C.mute }}>{r.label}</span>
          </div>
        ))}
      </div>

      {/* the promises pull out to the right, each with the follow-up Nemotron drafted */}
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${(W - 470 * U + (1 - prom) * 520 * U).toFixed(1)}px, ${170 * U}px)`, opacity: prom * (1 - tally), width: 410 * U }}>
        <div style={{ ...typeStyle('ui', 22 * U), fontWeight: 600, color: C.paper, marginBottom: 16 * U }}>Promises</div>
        {data.promises.map(([title, to, due], i) => {
          const s = L(CUE.promises) + f60(20) + i * f60(12);
          const p = prog(f, s, s + f60(30), E.out);
          const d = prog(f, s + f60(40), s + f60(70), E.inOut);
          return (
            <div key={title} data-ui style={{ opacity: p, transform: `translateY(${(1 - p) * 16 * U}px)`, marginBottom: 14 * U, padding: 16 * U, borderRadius: 12 * U, background: C.ink2, border: `${1.2 * U}px solid ${C.line2}` }}>
              <div style={{ ...typeStyle('ui', 19 * U), color: C.paper, fontWeight: 600 }}>{title}</div>
              <div style={{ ...typeStyle('ui', 15 * U), color: C.mute, marginTop: 4 * U }}>{`${to} · ${due}`}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 * U, marginTop: 8 * U, ...typeStyle('ui', 15 * U), color: C.accent, opacity: d }}>
                <Tick p={d} />
                Follow-up drafted
              </div>
            </div>
          );
        })}
      </div>

      {/* the day in numbers, over the whole network, with a dark band so it reads */}
      <div style={{ position: 'absolute', left: 0, top: 700 * U, width: W, height: 380 * U, opacity: tally, background: `linear-gradient(180deg, transparent 0%, ${C.ink} 38%, ${C.ink} 100%)` }} />
      <div style={{ position: 'absolute', left: 0, top: 820 * U, width: W, display: 'flex', justifyContent: 'center', gap: 70 * U, opacity: tally }}>
        {[
          { v: 14, label: 'conversations' },
          { v: 94, label: 'minutes heard' },
          { v: 50, label: 'memories', suffix: '+' },
          { v: 4, label: 'promises' },
          { v: 83, label: 'total cost', money: true },
        ].map((s, i) => {
          const st = L(CUE.tally) + i * f60(8);
          return (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * U, transform: `translateY(${(1 - prog(f, st, st + f60(30), E.out)) * 20 * U}px)`, opacity: prog(f, st, st + f60(24), E.out) }}>
              <div style={{ display: 'flex', alignItems: 'baseline', color: s.money ? C.accent : C.paper }}>
                {s.money && <span style={{ ...typeStyle('display', 72 * U) }}>$0.</span>}
                <Roll frame={f} from={0} to={s.v} start={st} dur={f60(60)} digits={2} pad={s.money} id={`tally-${i}`} size={72 * U} style={{ color: s.money ? C.accent : C.paper }} />
                {s.suffix && <span style={{ ...typeStyle('display', 72 * U) }}>{s.suffix}</span>}
              </div>
              <div style={{ ...typeStyle('ui', 22 * U), color: C.mute }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
