// The sound events of the film, computed from the picture code. scripts/export-cues.ts calls the
// default export and writes out/cues.json; scripts/audio/score.py voices each event with the
// film's sound kit (audio/kit.json: the earshot take for its kind) on its exact frame (schema,
// roles and recipes: references/sound.md).
//
// The rules this file follows:
// - Every sound has a visible cause, but not every picture event gets a sound: sound discrete
//   state changes (a press, an insert, a lock, a landing, the logo assembling), leave continuous
//   motion silent, and let the music carry most cuts. A class of action, once sounded, is
//   sounded every time.
// - Impacts go on the contact frame, pops on the 50% frame, settles on the 97% frame, and a
//   whoosh's apex on the velocity peak of the move it belongs to.
// - Import the constants the acts animate with (they export them for this file) and compute the
//   frame; a frame typed by hand drifts the first time an act is retimed.
// - Text gets one soft `text` sound per fragment, on the frame its last word visibly comes to rest
//   (chainResolves(), at the size the act sets the chain at), never one per word;
//   what was just said is read in near-silence. The lockup is a stop-down and ONE clean element:
//   score.py's stack guard warns when anything else lands within 3 f of it or leads into it.
import { chainResolves } from './fx/Chain';
import { COPY, CUE, TOTAL } from './timeline';

export type Kind =
  | 'tick' | 'tock' | 'hit' | 'land' | 'pop' | 'whoosh' | 'riser'
  | 'drop' | 'key' | 'click' | 'snap' | 'swell' | 'bell' | 'suck' | 'text';

export type SoundEvent = {
  f: number; // absolute frame the sound belongs on (fractional is fine)
  kind: Kind;
  weight?: number; // 0..2, 1 = normal; scales level (and size for whoosh and land)
  pan?: number; // -1 left .. +1 right from screen x; score.py keeps effects within +-0.15, a whoosh travels the full amount
  pitch?: number | string; // MIDI number or "Eb6"; omit and score.py picks a tone in key
  apexFrac?: number; // whoosh / suck: where in its length the loudest point sits (lands on f)
  dur?: number; // frames: whoosh, riser, swell and suck length
  variant?: string; // key: 'word' | 'space' | 'return' | 'back'; tick: 'crisp'; click: 'confirm'; land: 'light'; bell: 'motif'; pop: 'down'
  id?: string; // a name for QA reports
};

export default function cues(): SoundEvent[] {
  const ev: SoundEvent[] = [];
  // one soft sound per caption fragment, on the frame it lands
  for (const id of ['engine']) chainResolves(id).forEach((f, i) => ev.push({ f, kind: 'text', weight: 0.7, id: `${id}${i + 1}` }));
  for (const c of COPY.filter((x) => !x.chain && x.kind !== 'ui' && x.id !== 'wordmark')) ev.push({ f: c.resolved, kind: 'text', weight: 0.7, id: c.id });
  ev.push({ f: CUE.answer, kind: 'pop', weight: 0.8, id: 'answer' });
  ev.push({ f: CUE.lockup, kind: 'hit', weight: 1, id: 'lockup' });
  return ev.filter((e) => e.f < TOTAL).sort((x, y) => x.f - y.f);
}
