import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { C, typeStyle, U } from '../brand/tokens';
import { at, Device, Mark, moves, SCREEN, STAGE } from '../kit';
import { E, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { ACT, CUE, f60, H, sec, W } from '../timeline';

// ACT 2 - the iPhone: everything Earshot heard, not only this call. The conversation list holds while
// she names the rest of her day, and each real recording is tagged on its word: a lecture and a class
// from Sunday, a chat in Hindi and Urdu, then this call. Then the call opens: the summary, and the
// transcript with who said what.

const L = (abs: number) => abs - ACT.heard.from;
const SC = 0.95;
const S = SCREEN.phone;
const X = W / 2 - (S.w * SC) / 2;
const Y = 200 * U;
/** World point inside the capture, in screen points from its top-left. */
const p = (x: number, y: number) => ({ x: X + x * SC, y: Y + y * SC });
// rows of the list (screen points, from heard-list.png), tagged in the order she names them
const ROWS = [
  { top: 669, h: 106, tag: 'Lecture' },
  { top: 539, h: 110, tag: 'Class' },
  { top: 412, h: 112, tag: 'Chat · mixed languages' },
  { top: 215, h: 118, tag: 'Call · on speaker' },
];
const OPEN = CUE.heardPush - sec(0.3); // the list gives way to the recording as she reaches "Earshot"
const SKIP = CUE.promisePush - sec(0.1); // the capture holds still on the summary from 5.0 to 10.3 s: jump across it here

export const Heard: React.FC = () => {
  const f = useCurrentFrame();
  const wide = { ...at(W / 2, H / 2, 1), yaw: -16, pitch: 4 };
  const list = { ...at(W / 2 + 120 * U, p(0, 500).y, 1.08), yaw: -6, pitch: 2 };
  const a = p(S.w / 2, 450); // the summary
  const b2 = p(S.w / 2, 480); // the transcript, scrolled up: who said what
  const cam = moves(f, wide, [
    { at: 0, dur: L(CUE.kinds[0]), to: list },
    { at: L(CUE.heardPush), dur: f60(70), to: { ...at(a.x, a.y, 1.5, H / 2 + 60 * U), yaw: -3 } },
    { at: L(CUE.promisePush), dur: f60(80), to: { ...at(b2.x, b2.y, 1.5, H / 2 + 60 * U), yaw: 0 } },
  ]);
  const cur = CUE.kinds.reduce((n, c, i) => (f >= L(c) ? i : n), -1);
  const tags = 1 - prog(f, L(OPEN) - f60(16), L(OPEN), E.exit);
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      <div style={camera(cam)}>
        <Sequence durationInFrames={L(OPEN)} layout="none">
          <Device kind="phone" name="heard-list" x={X} y={Y} scale={SC} f={f} />
        </Sequence>
        <Sequence from={L(OPEN)} durationInFrames={L(SKIP) - L(OPEN)} layout="none">
          <Device kind="phone" name="heard" x={X} y={Y} scale={SC} f={f} at={3.6} />
        </Sequence>
        <Sequence from={L(SKIP)} layout="none">
          <Device kind="phone" name="heard" x={X} y={Y} scale={SC} f={f} at={10.3} />
        </Sequence>
        {tags > 0 &&
          ROWS.map((r, i) => {
            const on = prog(f, L(CUE.kinds[i]), L(CUE.kinds[i]) + f60(30), E.out);
            if (on <= 0) return null;
            const dim = i === cur ? 1 : 0.4;
            const cy = p(0, r.top + r.h / 2).y;
            return (
              <div key={r.tag} style={{ opacity: tags * dim }}>
                <Mark x={p(14, 0).x} y={p(0, r.top).y} w={374 * SC} h={r.h * SC} r={14} line={2} p={prog(f, L(CUE.kinds[i]), L(CUE.kinds[i]) + f60(36), E.inOut)} />
                <div style={{ position: 'absolute', left: p(S.w, 0).x + 22 * U, top: cy, width: 40 * U * on, height: 2 * U, background: C.accent }} />
                <div
                  data-ui
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    transform: `translate(${(p(S.w, 0).x + 70 * U + mix(-16, 0, on) * U).toFixed(1)}px, ${(cy - 26 * U).toFixed(1)}px)`,
                    opacity: on,
                    height: 52 * U,
                    padding: `0 ${22 * U}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12 * U,
                    borderRadius: 26 * U,
                    background: C.ink2,
                    border: `${1.5 * U}px solid ${i === cur ? C.accent : C.line2}`,
                    ...typeStyle('ui', 26 * U),
                    color: C.paper,
                  }}
                >
                  <div style={{ width: 10 * U, height: 10 * U, borderRadius: 5 * U, background: C.accent }} />
                  {r.tag}
                </div>
              </div>
            );
          })}
      </div>
    </AbsoluteFill>
  );
};
