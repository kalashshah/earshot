import React from 'react';
import { AbsoluteFill, getStaticFiles, Html5Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Call } from './acts/Call';
import { Heard } from './acts/Heard';
import { Ask } from './acts/Ask';
import { Features } from './acts/Features';
import { Brain } from './acts/Brain';
import { Engine } from './acts/Engine';
import { Privacy } from './acts/Privacy';
import { End } from './acts/End';
import { C } from './brand/tokens';
import { Audit } from './lib/Audit';
import { FontGate } from './lib/FontGate';
import type { SafeSpec } from './lib/safe';
import { ACT, f60, VO_AT } from './timeline';
import { E, mix, prog } from './lib/anim';
import vo from './vo.json';

/** Written by `npm run audio`. Renders are muted and scripts/render.sh muxes it with ffmpeg. */
export const SOUNDTRACK = 'audio/soundtrack.wav';
/** The call itself (ElevenLabs voices), heard in act 1. scripts/mix.sh mixes it and the narration into the final soundtrack. */
export const CALL_AUDIO = 'audio/call.mp3';

/**
 * Every act enters and leaves through a zoom: the outgoing shot pushes on into a blur as it fades,
 * the next one settles out of a blur from slightly small, so the cut reads as one forward move.
 */
const Shot: React.FC<{ dur: number; enter?: boolean; exit?: boolean; children: React.ReactNode }> = ({ dur, enter = true, exit = true, children }) => {
  const f = useCurrentFrame();
  const a = enter ? prog(f, 0, f60(36), E.out) : 1;
  const z = exit ? prog(f, dur - f60(18), dur, E.exit) : 0;
  const k = mix(0.93, 1, a) * mix(1, 1.12, z);
  const blur = (1 - a) * 16 + z * 18;
  return (
    <AbsoluteFill style={{ opacity: Math.min(a, 1 - z * 0.92), transform: `scale(${k.toFixed(4)})`, filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  );
};

export type FilmProps = { audit?: boolean; safe?: SafeSpec };

export const Film: React.FC<FilmProps> = ({ audit = false, safe }) => {
  const files = getStaticFiles().map((s) => s.name);
  return (
    <FontGate>
      <AbsoluteFill style={{ background: C.ink }}>
        <Sequence from={ACT.call.from} durationInFrames={ACT.call.dur} name="1 Call">
          <Shot dur={ACT.call.dur} enter={false}>
            <Call />
          </Shot>
        </Sequence>
        <Sequence from={ACT.heard.from} durationInFrames={ACT.heard.dur} name="2 Heard">
          <Shot dur={ACT.heard.dur}>
            <Heard />
          </Shot>
        </Sequence>
        <Sequence from={ACT.ask.from} durationInFrames={ACT.ask.dur} name="3 Ask">
          <Shot dur={ACT.ask.dur}>
            <Ask />
          </Shot>
        </Sequence>
        <Sequence from={ACT.features.from} durationInFrames={ACT.features.dur} name="4 Features">
          <Shot dur={ACT.features.dur}>
            <Features />
          </Shot>
        </Sequence>
        <Sequence from={ACT.brain.from} durationInFrames={ACT.brain.dur} name="5 Brain">
          <Shot dur={ACT.brain.dur}>
            <Brain />
          </Shot>
        </Sequence>
        <Sequence from={ACT.engine.from} durationInFrames={ACT.engine.dur} name="6 Engine">
          <Shot dur={ACT.engine.dur}>
            <Engine />
          </Shot>
        </Sequence>
        <Sequence from={ACT.privacy.from} durationInFrames={ACT.privacy.dur} name="7 Privacy">
          <Shot dur={ACT.privacy.dur}>
            <Privacy />
          </Shot>
        </Sequence>
        <Sequence from={ACT.end.from} durationInFrames={ACT.end.dur} name="8 End">
          <Shot dur={ACT.end.dur} exit={false}>
            <End />
          </Shot>
        </Sequence>
        {files.includes(SOUNDTRACK) && <Html5Audio src={staticFile(SOUNDTRACK)} />}
        {files.includes(CALL_AUDIO) && <Html5Audio src={staticFile(CALL_AUDIO)} />}
        {vo.map((v, i) => (
          <Sequence key={v.file} from={VO_AT[i]} name={`vo${i + 1}`}>
            <Html5Audio src={staticFile(v.file)} />
          </Sequence>
        ))}
        {audit && <Audit safe={safe} />}
      </AbsoluteFill>
    </FontGate>
  );
};
