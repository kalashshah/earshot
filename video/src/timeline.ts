// The single source of truth for time. Picture (src/acts), sound (src/sync.ts -> out/cues.json)
// and QA (scripts/grid-check.ts) all import this file, so a change here moves everything together.
// Think in bars and beats, never in seconds. Keep this file free of React and CSS imports:
// Node scripts load it directly.
import { holdFor, PACE, readingWindows, revealFor, wordCount, type PaceName } from './lib/pace';

export { PACE } from './lib/pace'; // grid-check checks COPY against the film's own pace numbers

export const FPS = 60;
export const BPM = 100;
export const W = 1920;
export const H = 1080;
/**
 * The film's pace (src/lib/pace.ts). calm: text arrives as short fragments that take turns with
 * the picture, held about 1-1.5 s (the default for text-led films, at 90-100 BPM). crisp: the
 * denser launch-film tempo, for briefs that ask for energy (at 120 BPM).
 */
export const PACE_NAME: PaceName = 'calm';

/** Frames per beat. Must be a whole number (grid-check fails otherwise): 60 fps -> 90, 100, 120, 144, 150 BPM. */
export const BEAT = (60 / BPM) * FPS;
export const BAR = BEAT * 4;
/**
 * Absolute frame of a grid position: bar is 1-based, beat 0-3, sub = 16ths within the beat.
 * b(3) is the downbeat of bar 3; b(2, 1, 2) is the "and" of beat 2 in bar 2.
 */
export const b = (bar: number, beat = 0, sub = 0) => Math.round(((bar - 1) * 4 + beat) * BEAT + sub * (BEAT / 4));

/**
 * A choreography length written in 60 fps frames (the unit every number in the cinetic
 * references uses), converted to this film's fps. Cues come from b(); durations inside a move
 * use f60(), so the film keeps its timing if --fps changes.
 */
export const f60 = (frames: number) => Math.round((frames * FPS) / 60);

/** After the last bar the picture holds while the audio decays to digital silence. */
export const TAIL = FPS;

/** A moment in seconds, snapped to the 16th grid: the call and the narration are timed in seconds. */
export const sec = (t: number) => Math.round((t * FPS) / (BEAT / 4)) * (BEAT / 4);

// Acts: contiguous, bar-aligned, [from, from + dur). Each act is its own composition in Root.tsx.
const span = (from: number, to: number) => ({ from: b(from), dur: b(to) - b(from) });
export const ACT = {
  call: span(1, 11), // the watch hears Dad's call on speaker, mid-run; "Andrew Chen" lights up
  heard: span(11, 17), // iPhone: everything it heard that day, each kind tagged; then the call, who said what
  ask: span(17, 23), // a week later: ask the watch who it was
  features: span(23, 32), // the watch, the phone, the web: each with what it does
  brain: span(32, 42), // the memory: a day of talk going in, facts kept, research, promises out
  engine: span(42, 53), // under the hood: the pipeline and the eval numbers
  privacy: span(53, 57), // audio deleted, export, delete
  end: { from: b(57), dur: b(60) + TAIL - b(57) }, // the orb gathers into the lockup
};

export const TOTAL = b(60) + TAIL;

/** Narration clip n (1-based) starts at this second; word cues below are its start plus the word's time in src/vo.json. */
const V = { 1: 20.6, 2: 24.3, 3: 38.7, 5: 53.1, 6: 60.3, 7: 67.2, 8: 75.0, 9: 99.2, 10: 113.8, 11: 125.4 };
/** The ask capture plays at ASK_RATE from act-local ASK_LOCAL s (its own second 2.6), so the tap lands on "asked". */
export const ASK_LOCAL = 4.2;
const ASK_AT = 38.4 + ASK_LOCAL;
export const ASK_RATE = 2;
const askT = (captureSec: number) => ASK_AT + (captureSec - 2.6) / ASK_RATE; // ask-film.mp4 second -> film second

// Named sync points (absolute frames), all on the 16th grid.
export const CUE = {
  callEnd: sec(20.5), // the call audio has finished; the camera pulls off the watch
  kinds: [sec(V[2] + 4.16), sec(V[2] + 4.46), sec(V[2] + 5.88), sec(V[2] + 8.0)], // "lectures" (two rows), "chats", "calls" (vo02)
  heardPush: sec(V[2] + 9.5), // "Earshot": the call opens, push into the summary
  promisePush: sec(V[2] + 10.55), // "who said what": push into the transcript, speaker by speaker
  askTap: sec(askT(3.7)), // the Ask button is pressed on the watch (ask-film.mp4)
  answer: sec(askT(15.5)), // the answer appears
  answerPush: sec(askT(15.5) + 0.3), // push in on the answer
  watch: sec(52.8), // features: the watch panel
  phone: sec(V[6] - 0.3), // the phone panel
  web: sec(V[7] - 0.3), // the web panel
  brainIn: sec(V[8]), // "Underneath, it builds a memory"
  heardDay: sec(V[8] + 3.84), // "heard thirteen conversations": the day pours in
  facts: sec(V[8] + 8.28), // "kept over fifty facts"
  merge: sec(V[8] + 10.64), // "merges what it hears twice"
  research: sec(V[8] + 12.88), // "researches the people I mention overnight"
  promises: sec(V[8] + 15.6), // "turns what I promised into follow-ups"
  tally: sec(94.2), // the day in numbers
  pipe: sec(V[9] + 0.4), // the pipeline starts drawing
  tavily: sec(V[9] + 0.4) + 5 * BEAT, // Tavily's node lands (born(5) in Engine), between the two halves of the engine line
  models: [sec(V[9] + 6.64), sec(V[9] + 8.64), sec(V[9] + 12.16)], // "Lightning", "Super", "Ultra" (vo09)
  engineClear: sec(V[10] - 0.6), // the diagram clears for the numbers
  stat1: sec(V[10] + 1.84), // "seventy-three"
  stat2: sec(V[10] + 5.12), // "tenth"
  stat3: sec(V[10] + 7.7), // after "each." ends and stat2 has been read
  privacyPush: sec(V[11] + 1.3), // the push onto the three promises
  gather: b(57), // the orb gathers home
  lockup: b(58, 2), // the name locks beside it
  end: b(60),
};

/** Narration (public/vo/voNN.mp3, scripts/voice.mjs), Veda Sky: each clip's first frame. */
export const VO_AT = [sec(V[1]), sec(V[2]), sec(V[3]), CUE.answer + sec(0.15), sec(V[5]), sec(V[6]), sec(V[7]), sec(V[8]), sec(V[9]), sec(V[10]), sec(V[11]), CUE.lockup - sec(0.1)];
/** The call (public/audio/call.mp3) starts on frame 0; the watch capture started recording this much earlier. */
export const CALL_CAPTURE_LEAD = 1.8;

export type Copy = {
  id: string;
  text: string; // exactly what is on screen (\n separates lines)
  in: number; // first frame any of it is visible
  resolved: number; // first frame it is fully readable
  out: number; // first frame it starts to leave (TOTAL if it stays)
  kind?: 'copy' | 'ui'; // 'ui': a string the product shows (a typed command, code, a URL, an app label); not budgeted
  chain?: string; // the thought this fragment belongs to (fx/Chain renders a chain; grid-check checks its gaps)
  mode?: 'build' | 'replace'; // build: fragments append to one held line; replace: each takes the last one's place
};

const pace = PACE[PACE_NAME];

/**
 * One line of copy revealed word by word with this film's pace (the numbers <Words> uses), so
 * `resolved` is the frame its last word is fully in. `out` defaults to the pace's hold.
 */
export const line = (id: string, text: string, inF: number, out?: number): Copy => {
  const n = wordCount(text);
  const resolved = inF + f60(revealFor(n, pace));
  return { id, text, in: inF, resolved, out: out ?? resolved + f60(holdFor(n, pace)) };
};

/**
 * One thought as a chain of fragments, one COPY entry each (`<id>.1`, `<id>.2`, ...), rendered by
 * fx/Chain. A thought longer than 4 words arrives this way: 1-4 words per fragment, never a whole
 * sentence at once, with a picture beat between fragments (the product does what the fragment set
 * up). Give each fragment its first frame; `resolved` follows from the pace.
 *   build    fragments append to one held line, which re-centres; the line clears as a whole, at
 *            `out` (default: the last fragment's resolve plus the hold of the full line)
 *   replace  each fragment leaves (as a whole, over pace.exitDur: 24 f when calm) and has gone
 *            6 f before the next one rises in its place, so two fragments never share the spot;
 *            the last one leaves at `out` (default: its resolve plus its hold)
 * grid-check checks the result: every fragment is read before the next arrives, the picture beat
 * between them, the words on screen at once and the copy rate.
 */
export const chain = (id: string, mode: 'build' | 'replace', fragments: [text: string, inF: number][], o: { out?: number } = {}): Copy[] => {
  const base = fragments.map(([text, inF], i) => ({ id: `${id}.${i + 1}`, text, in: inF, resolved: inF + f60(revealFor(wordCount(text), pace)), chain: id, mode }));
  const last = base[base.length - 1];
  if (!last) throw new Error(`timeline: chain "${id}" has no fragments`);
  const words = (list: { text: string }[]) => list.reduce((n, c) => n + wordCount(c.text), 0);
  if (mode === 'build') {
    const out = o.out ?? last.resolved + f60(holdFor(words(base), pace));
    return base.map((c) => ({ ...c, out }));
  }
  // replace: the outgoing fragment's exit (exitDur) is over 6 f before the next one starts to rise
  const leave = f60(pace.exitDur) + f60(6);
  return base.map((c, i) => ({ ...c, out: base[i + 1] ? base[i + 1].in - leave : (o.out ?? c.resolved + f60(holdFor(wordCount(c.text), pace))) }));
};

// Every on-screen word: the word budget (kind: 'ui' entries are counted apart), the hold check,
// and the text-flow checks (fragments, words on screen at once, copy rate, text share) read this.
export const COPY: Copy[] = [
  line('later', 'A week later.', sec(V[3])),
  ...chain('engine', 'build', [['Three Nemotron models,', sec(V[9] + 1.0)], ['one per job.', sec(V[9] + 5.0)]]),
  // each stat has fully left (24 f exit + 6 f) before the next one rises in its place
  line('stat1', '73% answered right', CUE.stat1, CUE.stat2 - f60(30)),
  line('stat2', '$0.0008 a question', CUE.stat2, CUE.stat3 - f60(30)),
  line('stat3', '80% speakers right', CUE.stat3, ACT.engine.from + ACT.engine.dur), // held to the cut
  { id: 'wordmark', text: 'Earshot', in: CUE.lockup - f60(34), resolved: CUE.lockup, out: TOTAL },
  { id: 'url', text: 'earshot.keronlabs.com', in: b(56, 2), resolved: b(56, 2) + f60(30), out: TOTAL, kind: 'ui' },
];

/**
 * When each COPY entry is being read: [from, to) frame ranges by id (src/lib/pace.ts
 * readingWindows(): from `resolved` for at most readMax, an earlier fragment of a build chain only
 * for its own hold, then the whole line again). The one rule every check uses: export-cues.ts
 * writes it into out/cues.json, and grid-check, layout-audit, measure-speed and forensics read it.
 * Nothing new should start inside a window: the read happens in the quiet.
 */
export const READ = readingWindows(COPY, pace, FPS, TOTAL);

/** One COPY entry by id; acts read their text and timing from here so the budget stays true. */
export const copy = (id: string): Copy => {
  const c = COPY.find((x) => x.id === id);
  if (!c) throw new Error(`timeline: no COPY entry "${id}"`);
  return c;
};

/** The fragments of one chain, in order of arrival. */
export const chainOf = (id: string): Copy[] => {
  const list = COPY.filter((x) => x.chain === id).sort((p, q) => p.in - q.in);
  if (!list.length) throw new Error(`timeline: no COPY chain "${id}"`);
  return list;
};
