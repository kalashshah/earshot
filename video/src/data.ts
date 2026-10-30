// Product strings the film shows outside the captures: the call's transcript (as Deepgram returned
// it for public/audio/call.mp3) and the pipeline's real parts and numbers (README, server/eval).

/** The call, line by line: seconds into call.mp3. Replace with the real transcript timings. */
export const CALL: { who: string; text: string; start: number; end: number }[] = [
  { who: 'You', text: "Hey, Dad! I'm out on a run, and I didn't bring my earphones, so you're on speaker.", start: 0, end: 7.11 },
  { who: 'Dad', text: 'Look up Andrew Chen. He led rider growth at Uber, and he writes about how apps grow. Your cousin swears by him.', start: 7.38, end: 13.72 },
  { who: 'You', text: "Okay, I'll check it later. Talk later, Dad. Bye!", start: 14.28, end: 19.79 },
];
/** The word the accent lights in the transcript: what Earshot will be asked for a week later. */
export const KEY_WORD = 'Andrew Chen';

/** The pipeline, left to right. `sub` is what each part does in Earshot. */
export const PIPE = [
  { id: 'watch', name: 'Apple Watch', sub: 'hears the conversation' },
  { id: 'stt', name: 'Deepgram Nova-3', sub: 'transcribes, splits speakers' },
  { id: 'llm', name: 'Nemotron', sub: 'on Nebius Token Factory' },
  { id: 'mem', name: 'MemoryHQ', sub: 'keeps what matters' },
];
export const MODELS = [
  { name: 'Nemotron Lightning', job: 'picks the conversations' },
  { name: 'Nemotron Super', job: 'extracts and answers' },
  { name: 'Nemotron Ultra', job: 'writes the morning brief' },
];
export const TAVILY = { name: 'Tavily', sub: 'researches overnight' };
