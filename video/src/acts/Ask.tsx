import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { C, typeStyle, U } from '../brand/tokens';
import { Roll } from '../fx/Roll';
import { at, Device, Line, moves, SCREEN, STAGE } from '../kit';
import { E, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { ACT, ASK_LOCAL, ASK_RATE, CUE, f60, FPS, H, W } from '../timeline';

// ACT 3 - a week later, on the wrist. The date rolls from the call's Friday to the next one along a
// week strip, then the watch rises into frame: tap Ask, type the question, and the answer comes back
// from the call. The camera turns square and pushes in on the answer so it reads on a phone.

const L = (abs: number) => abs - ACT.ask.from;
const SC = 2.3;
const S = SCREEN.watch;
const X = W / 2 - (S.w * SC) / 2;
const Y = 210 * U;
/** World point inside the capture, in screen points from its top-left. */
const p = (x: number, y: number) => ({ x: X + x * SC, y: Y + y * SC });
const DAYS = [23, 24, 25, 26, 27, 28, 29, 30];
const ROLL = { at: f60(36), dur: f60(90) }; // "A week later" @51.0
const GAP = 64 * U;

export const Ask: React.FC = () => {
  const f = useCurrentFrame();
  const wide = { ...at(W / 2, H / 2, 1), yaw: 14, pitch: 3 };
  const a = p(S.w / 2, S.h * 0.55);
  const cam = moves(f, wide, [{ at: L(CUE.answerPush), dur: f60(110), to: { ...at(a.x, a.y, 1.45, H / 2 + 50 * U), yaw: 0, pitch: 0 } }]);
  const dateIn = prog(f, 0, f60(30), E.out);
  const week = prog(f, ROLL.at, ROLL.at + ROLL.dur, E.inOut);
  const dateOut = prog(f, f60(150), f60(184), E.exit);
  const rise = prog(f, f60(140), f60(214), E.out);
  const stripW = GAP * (DAYS.length - 1);
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      <div style={{ ...camera(cam), opacity: rise }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translateY(${((1 - rise) * 820 * U).toFixed(1)}px)` }}>
          {/* the face drifts slowly while the watch rises, then the recording runs at ASK_RATE from just before the tap */}
          <Sequence durationInFrames={Math.round(ASK_LOCAL * FPS)} layout="none">
            <Device kind="watch" name="ask-film" x={X} y={Y} scale={SC} f={f} rate={0.6} />
          </Sequence>
          <Sequence from={Math.round(ASK_LOCAL * FPS)} layout="none">
            <Device kind="watch" name="ask-film" x={X} y={Y} scale={SC} f={f} at={2.6} rate={ASK_RATE} />
          </Sequence>
        </div>
      </div>
      {dateOut < 1 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: dateIn * (1 - dateOut),
            transform: `translateY(${(mix(30, 0, dateIn) - 120 * dateOut) * U}px) scale(${mix(1, 0.9, dateOut)})`,
            filter: dateOut > 0 ? `blur(${(dateOut * 14).toFixed(2)}px)` : undefined,
          }}
        >
          <div style={{ position: 'absolute', top: 330 * U, width: W, textAlign: 'center', ...typeStyle('ui', 30 * U), color: C.mute, letterSpacing: '0.02em' }}>Friday, October</div>
          <div style={{ position: 'absolute', top: 380 * U, width: W, display: 'flex', justifyContent: 'center' }}>
            <Roll frame={f} from={23} to={30} start={ROLL.at} dur={ROLL.dur} ease={E.inOut} digits={2} id="askday" size={230 * U} style={{ color: C.paper }} />
          </div>
          {/* the week between the call and the question: a marker walks the strip as the date rolls */}
          <div style={{ position: 'absolute', left: W / 2 - stripW / 2, top: 700 * U, width: stripW, height: 2 * U, background: C.line2 }} />
          <div style={{ position: 'absolute', left: W / 2 - stripW / 2, top: 700 * U, width: stripW * week, height: 2 * U, background: C.paper }} />
          {DAYS.map((d, i) => {
            const lit = week * (DAYS.length - 1) >= i - 0.01;
            return (
              <React.Fragment key={d}>
                <div style={{ position: 'absolute', left: W / 2 - stripW / 2 + i * GAP - 6 * U, top: 695 * U, width: 12 * U, height: 12 * U, borderRadius: 6 * U, background: lit ? C.paper : C.ink, border: `${2 * U}px solid ${lit ? C.paper : C.line2}`, boxSizing: 'border-box' }} />
                <div style={{ position: 'absolute', left: W / 2 - stripW / 2 + i * GAP - 30 * U, top: 724 * U, width: 60 * U, textAlign: 'center', ...typeStyle('ui', 20 * U), color: lit ? C.mute : C.faint }}>{d}</div>
              </React.Fragment>
            );
          })}
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${(W / 2 - stripW / 2 + stripW * week - 14 * U).toFixed(2)}px, ${687 * U}px)`, width: 28 * U, height: 28 * U, borderRadius: 14 * U, border: `${2 * U}px solid ${C.paper}`, boxSizing: 'border-box' }} />
        </div>
      )}
      <Line id="later" f={f} from={ACT.ask.from} />
    </AbsoluteFill>
  );
};
