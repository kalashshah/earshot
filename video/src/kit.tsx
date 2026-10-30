import React from 'react';
import { getStaticFiles, Img, OffthreadVideo, staticFile } from 'remotion';
import { C, FONT, typeStyle, U } from './brand/tokens';
import { Chain } from './fx/Chain';
import { Words } from './fx/Words';
import { E, prog } from './lib/anim';
import { lc, type Shot } from './lib/camera';
import { copy, FPS, H, TOTAL, W } from './timeline';

// Shared pieces for the acts: the two device bodies, a real capture playing inside one, and the
// captions. Every capture is a screen recording of the real app (public/captures/*.mp4, made with
// `xcrun simctl io <device> recordVideo` or a browser recording); nothing inside a device is drawn.

/** Screen sizes in points of the simulators we record (Apple Watch 46 mm, iPhone 17 Pro), and a browser. */
export const SCREEN = {
  watch: { w: 208, h: 248, r: 54, bezel: 12 },
  phone: { w: 402, h: 874, r: 62, bezel: 12 },
  web: { w: 1440, h: 900, r: 14, bezel: 0 },
};
export type DeviceKind = keyof typeof SCREEN;
/** The browser's title bar above a web capture, in points. */
export const CHROME = 52;
const URLS: Record<string, string> = { brief: 'earshot.keronlabs.com/today', privacy: 'earshot.keronlabs.com/privacy' };

const have = (name: string, ext = 'mp4') => getStaticFiles().some((s) => s.name === `captures/${name}.${ext}`);
const abs = (st: React.CSSProperties): React.CSSProperties => ({ position: 'absolute', ...st });
/** Light falling on glass from the top left: a soft sheen that never hides the screen. */
const gloss = (r: number) => (
  <div style={abs({ inset: 0, borderRadius: r, pointerEvents: 'none', background: 'linear-gradient(122deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.035) 34%, rgba(255,255,255,0) 34.5%, rgba(255,255,255,0) 100%)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.07)' })} />
);
const metal = (deg: number) => `linear-gradient(${deg}deg, ${C.metalHi} 0%, ${C.metal} 16%, ${C.metalLo} 48%, ${C.metal} 82%, ${C.metalHi} 100%)`;
const caseLight = (k: number) => `inset 0 ${1.6 * k}px ${1.2 * k}px rgba(255,255,255,.38), inset 0 ${-1.6 * k}px ${2 * k}px rgba(0,0,0,.7), 0 ${36 * k}px ${70 * k}px rgba(0,0,0,.55), 0 ${8 * k}px ${16 * k}px rgba(0,0,0,.4)`;

/**
 * A capture inside its device body, laid out in world px at (x, y) = the screen's top-left, `scale`
 * screen points to px. `at` is the capture's own second shown on the act's frame 0; `f` the act frame.
 * A missing capture draws a labelled slot, so the film can be timed before the recordings exist.
 * The watch is a space-black aluminium case with its crown, side button and a sport band running
 * off frame; the phone a titanium rim with its buttons and Dynamic Island; the web a browser window.
 */
export const Device: React.FC<{ kind: DeviceKind; name: string; x: number; y: number; scale: number; at?: number; rate?: number; f: number; scroll?: number; covers?: [left: number, top: number, w: number, h: number][] }> = ({
  kind,
  name,
  x,
  y,
  scale: k,
  at = 0,
  rate = 1,
  f,
  scroll = 0,
  covers = [],
}) => {
  const s = SCREEN[kind];
  const w = s.w * k;
  const h = s.h * k;
  const b = s.bezel * k;
  const screen = (
    <div style={{ width: w, height: h, borderRadius: kind === 'web' ? 0 : s.r * k, overflow: 'hidden', background: C.black, position: 'relative' }}>
      {have(name, 'png') ? (
        // a full-page capture of the real page (2x), scrolled by the act: `scroll` in page points
        <Img src={staticFile(`captures/${name}.png`)} style={{ width: w, display: 'block', transform: `translateY(${(-scroll * k).toFixed(2)}px)` }} />
      ) : have(name) ? (
        <OffthreadVideo src={staticFile(`captures/${name}.mp4`)} muted startFrom={Math.round(at * FPS)} playbackRate={rate} style={{ width: w, height: h, objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ ...typeStyle('ui', 20 * U), color: C.faint, fontFamily: FONT.mono, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center' }}>
          {`${name}.mp4\n${Math.round(f / FPS + at)} s`}
        </div>
      )}
      {/* black patches over parts of the recording that would give away when it was made (screen points) */}
      {covers.map(([l, t, cw, chh]) => (
        <div key={`${l},${t}`} style={abs({ left: l * k, top: t * k, width: cw * k, height: chh * k, background: C.black })} />
      ))}
      {kind === 'phone' && <div style={abs({ left: (w - 124 * k) / 2, top: 11 * k, width: 124 * k, height: 36 * k, borderRadius: 18 * k, background: C.black })} />}
    </div>
  );

  if (kind === 'web') {
    const ch = CHROME * k;
    return (
      <div style={abs({ left: 0, top: 0, transform: `translate(${x}px, ${y - ch}px)`, borderRadius: s.r * k, overflow: 'hidden', background: C.ink2, boxShadow: `0 0 0 ${1.5 * k}px ${C.line2}, 0 ${40 * k}px ${110 * k}px rgba(0,0,0,.6)` })}>
        <div style={{ height: ch, width: w, position: 'relative', borderBottom: `${k}px solid ${C.line}` }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={abs({ left: (22 + i * 22) * k, top: ch / 2 - 6.5 * k, width: 13 * k, height: 13 * k, borderRadius: 7 * k, background: C.line2 })} />
          ))}
          <div style={abs({ left: (s.w / 2 - 270) * k, top: ch / 2 - 16 * k, width: 540 * k, height: 32 * k, borderRadius: 9 * k, background: C.sunk, display: 'flex', alignItems: 'center', justifyContent: 'center', ...typeStyle('ui', 16 * k), color: C.mute })}>
            {URLS[name] ?? 'earshot.keronlabs.com'}
          </div>
        </div>
        {screen}
      </div>
    );
  }

  const rim = (kind === 'watch' ? 9 : 5) * k; // metal around the black glass border
  const CW = w + 2 * b + 2 * rim;
  const CH = h + 2 * b + 2 * rim;
  const R = (s.r + s.bezel) * k + rim;
  const glass = (
    <div style={abs({ left: rim, top: rim, width: w + 2 * b, height: h + 2 * b, padding: b, boxSizing: 'border-box', borderRadius: R - rim, background: C.black })}>
      {screen}
      {gloss(R - rim)}
    </div>
  );
  if (kind === 'phone') {
    // titanium rim with the action button and volume keys on the left, side button and Camera Control on the right
    const keys: [side: number, top: number, len: number][] = [[-1, 150, 30], [-1, 205, 58], [-1, 278, 58], [1, 225, 92], [1, 560, 40]];
    return (
      <div style={abs({ left: 0, top: 0, transform: `translate(${x - b - rim}px, ${y - b - rim}px)` })}>
        {keys.map(([side, top, len]) => (
          <div key={top} style={abs({ left: side < 0 ? -2.6 * k : CW - 1.4 * k, top: top * k, width: 4 * k, height: len * k, borderRadius: 2 * k, background: metal(90) })} />
        ))}
        <div style={{ position: 'relative', width: CW, height: CH, borderRadius: R, background: metal(100), boxShadow: caseLight(k) }}>{glass}</div>
      </div>
    );
  }

  // the watch: band first (it runs under the case), then the crown and button, then the case
  const BW = CW * 0.8;
  const bandBg = `linear-gradient(90deg, ${C.metalLo} 0%, ${C.band} 10%, ${C.bandHi} 50%, ${C.band} 90%, ${C.metalLo} 100%)`;
  const LONG = 1500 * U;
  const holes = Array.from({ length: 9 }, (_, i) => CH + (120 + i * 38) * k);
  return (
    <div style={abs({ left: 0, top: 0, transform: `translate(${x - b - rim}px, ${y - b - rim}px)` })}>
      <div style={abs({ left: (CW - BW) / 2, top: -LONG, width: BW, height: LONG + 30 * k, background: bandBg, borderRadius: `0 0 ${14 * k}px ${14 * k}px` })} />
      <div style={abs({ left: (CW - BW) / 2, top: CH - 30 * k, width: BW, height: LONG, background: bandBg, borderRadius: `${14 * k}px ${14 * k}px 0 0` })} />
      {holes.map((t) => (
        <div key={t} style={abs({ left: CW / 2 - 4.5 * k, top: t, width: 9 * k, height: 9 * k, borderRadius: 5 * k, background: C.metalLo, boxShadow: `inset 0 ${k}px ${2 * k}px rgba(0,0,0,.8), 0 ${0.6 * k}px 0 rgba(255,255,255,.08)` })} />
      ))}
      {/* the Digital Crown: a knurled cylinder on a shoulder, lit from above */}
      <div style={abs({ left: CW - 5 * k, top: rim + b + h * 0.17 + 6 * k, width: 9 * k, height: 34 * k, borderRadius: 3 * k, background: metal(90) })} />
      <div style={abs({ left: CW + 1 * k, top: rim + b + h * 0.17, width: 14 * k, height: 46 * k, borderRadius: 4 * k, background: `linear-gradient(90deg, rgba(0,0,0,.55), rgba(255,255,255,.18) 45%, rgba(0,0,0,.65)), repeating-linear-gradient(180deg, ${C.metalHi} 0px, ${C.metalHi} ${1.3 * k}px, ${C.metalLo} ${1.3 * k}px, ${C.metalLo} ${2.6 * k}px)`, boxShadow: `0 ${4 * k}px ${8 * k}px rgba(0,0,0,.5)` })} />
      <div style={abs({ left: CW - 3 * k, top: rim + b + h * 0.56, width: 6 * k, height: 68 * k, borderRadius: 3 * k, background: metal(90) })} />
      <div style={{ position: 'relative', width: CW, height: CH, borderRadius: R, background: metal(145), boxShadow: caseLight(k) }}>{glass}</div>
    </div>
  );
};

/** The stage: a soft pool of light where the devices sit, falling off to the app's own black. */
export const STAGE = `radial-gradient(ellipse 72% 62% at 50% 46%, ${C.stage} 0%, ${C.ink} 74%)`;

/**
 * A highlight drawn onto the product, in world px: a rounded outline in the accent that strokes on
 * clockwise as `p` goes 0 to 1, with a faint fill behind it. `line` is the stroke in world px.
 */
export const Mark: React.FC<{ x: number; y: number; w: number; h: number; r?: number; p: number; line?: number }> = ({ x, y, w, h, r = 10, p, line = 2 }) =>
  p <= 0 ? null : (
    <svg style={abs({ left: 0, top: 0, overflow: 'visible', transform: `translate(${x}px, ${y}px)` })} width={w} height={h}>
      <rect x={0} y={0} width={w} height={h} rx={r} fill={C.accent} fillOpacity={0.07 * Math.min(1, p * 1.5)} />
      <rect x={0} y={0} width={w} height={h} rx={r} fill="none" stroke={C.accent} strokeWidth={line} pathLength={1} strokeDasharray={`${p} 1`} strokeLinecap="round" />
    </svg>
  );

/** Caption band: film copy sits on the top eye line, clear of the devices. */
export const CAPTION_TOP = 112 * U;

/** One chain of film copy (build or replace) on the caption line. */
export const Caption: React.FC<{ chain: string; f: number; from: number; top?: number }> = ({ chain, f, from, top = CAPTION_TOP }) => (
  <Chain chain={chain} frame={f} from={from} role="line" color={C.paper} top={top} />
);

/** A single COPY line on the caption line, centred. */
export const Line: React.FC<{ id: string; f: number; from: number; top?: number; size?: number }> = ({ id, f, from, top = CAPTION_TOP, size }) => {
  const c = copy(id);
  const sz = size ?? 64 * U;
  return (
    <div style={{ position: 'absolute', left: 0, top, width: W, display: 'flex', justifyContent: 'center' }}>
      <Words
        id={id}
        text={c.text}
        frame={f + from}
        start={c.in}
        out={c.out < TOTAL ? c.out : undefined}
        size={sz}
        style={{ ...typeStyle('line', sz), color: C.paper }}
      />
    </div>
  );
};

/**
 * A chain of camera moves: the shot starts at `from`, and each move eases (E.cam) to its shot over
 * its frames, beginning where the last one ended, so pushes never jump. Frames are act-local.
 */
export const moves = (f: number, from: Shot, list: { at: number; dur: number; to: Shot }[]): Shot =>
  list.reduce((s, m) => lc(s, m.to, prog(f, m.at, m.at + m.dur, E.cam)), from);

/** The shot that frames world point (x, y) at the frame centre, scaled k. */
export const at = (x: number, y: number, k: number, sy = H / 2): Shot => ({ ax: x, ay: y, sx: W / 2, sy, k });
