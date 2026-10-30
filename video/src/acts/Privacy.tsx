import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { U } from '../brand/tokens';
import { at, Device, Mark, moves, SCREEN, STAGE } from '../kit';
import { E, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { ACT, CUE, f60, H, sec, W } from '../timeline';

// ACT 6 - the privacy page: audio deleted on transcription, export and delete everything. The camera pushes onto the three promises.

const L = (abs: number) => abs - ACT.privacy.from;
const SC = 1.0;
const S = SCREEN.web;
const X = W / 2 - (S.w * SC) / 2;
const Y = 210 * U;
/** World point inside the capture, in screen points from its top-left. */
const p = (x: number, y: number) => ({ x: X + x * SC, y: Y + y * SC });

export const Privacy: React.FC = () => {
  const f = useCurrentFrame();
  const a = p(660, 205);
  const cam = moves(f, { ...at(W / 2, H / 2, 0.86), yaw: 12, pitch: 6 }, [{ at: L(CUE.privacyPush), dur: f60(110), to: at(a.x, a.y, 2.2, H / 2 + 60 * U) }]);
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: 'hidden' }}>
      <div style={camera(cam)}>
        <Device kind="web" name="privacy" x={X} y={Y} scale={SC} f={f} />
        {/* each promise strokes in on its word: "deleted" @126.32, "Everything else" @128.68, "export" @129.96 */}
        <Mark x={p(256, 0).x} y={p(0, 101).y} w={266} h={150} r={14} line={1.4} p={prog(f, L(sec(126.3)), L(sec(126.3)) + f60(46), E.inOut)} />
        <Mark x={p(527, 0).x} y={p(0, 101).y} w={266} h={150} r={14} line={1.4} p={prog(f, L(sec(128.7)), L(sec(128.7)) + f60(46), E.inOut)} />
        <Mark x={p(797, 0).x} y={p(0, 101).y} w={266} h={150} r={14} line={1.4} p={prog(f, L(sec(129.0)), L(sec(129.0)) + f60(46), E.inOut)} />
        <Mark x={p(910, 0).x} y={p(0, 45).y} w={154} h={44} r={10} line={1.4} p={prog(f, L(sec(129.9)), L(sec(129.9)) + f60(36), E.inOut)} />
      </div>
    </AbsoluteFill>
  );
};
