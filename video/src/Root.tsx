import React from 'react';
import { Composition, Folder } from 'remotion';
import { Call } from './acts/Call';
import { Heard } from './acts/Heard';
import { Ask } from './acts/Ask';
import { Features } from './acts/Features';
import { Brain } from './acts/Brain';
import { Engine } from './acts/Engine';
import { Privacy } from './acts/Privacy';
import { End } from './acts/End';
import { C } from './brand/tokens';
import { Film, FilmProps } from './Film';
import { FilmSub, subMetadata } from './FilmSub';
import { Audit } from './lib/Audit';
import { FontGate } from './lib/FontGate';
import { ACT, FPS, H, TOTAL, W } from './timeline';

// An act on its own, font-gated like the film, so it can be iterated without scrubbing the film.
// Composition ActN is the Nth entry of ACT (scripts/layout-audit.sh relies on that order).
const solo = (Act: React.FC) => {
  const Solo: React.FC<FilmProps> = ({ audit = false, safe }) => (
    <FontGate>
      <div style={{ position: 'absolute', inset: 0, background: C.ink }}>
        <Act />
        {audit && <Audit safe={safe} />}
      </div>
    </FontGate>
  );
  return Solo;
};

export const RemotionRoot: React.FC = () => (
  <>
    {/* The film. Render with scripts/render.sh (muted picture + ffmpeg mux + sync check). */}
    <Composition id="Film" component={Film} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
    {/* The film as sub-frames for the motion-blurred master (render.sh --blur passes out/samples.json). */}
    <Composition
      id="FilmSub"
      component={FilmSub}
      durationInFrames={TOTAL}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{ groups: [] as number[] }}
      calculateMetadata={subMetadata}
    />

    <Folder name="Acts">
      <Composition id="Act1" component={solo(Call)} durationInFrames={ACT.call.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
      <Composition id="Act2" component={solo(Heard)} durationInFrames={ACT.heard.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
      <Composition id="Act3" component={solo(Ask)} durationInFrames={ACT.ask.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
      <Composition id="Act4" component={solo(Features)} durationInFrames={ACT.features.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
      <Composition id="Act4b" component={solo(Brain)} durationInFrames={ACT.brain.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
      <Composition id="Act5" component={solo(Engine)} durationInFrames={ACT.engine.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
      <Composition id="Act6" component={solo(Privacy)} durationInFrames={ACT.privacy.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
      <Composition id="Act7" component={solo(End)} durationInFrames={ACT.end.dur} fps={FPS} width={W} height={H} defaultProps={{ audit: false } as FilmProps} />
    </Folder>
  </>
);
