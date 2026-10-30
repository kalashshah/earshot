// Dad's call, heard by the watch: she's out on a run with no earphones, so Dad is on speaker. Two voices
// in one take (ElevenLabs text-to-dialogue, eleven_v3), Dad's turns band-limited like a phone speaker,
// over a running bed (ElevenLabs sound effects). Then a speech-to-text check that "Andrew Chen" survives,
// since the pipeline needs the name. Key read at runtime from media-generator, never copied here.
//   node scripts/call.mjs                       → public/audio/call.mp3 with the default pair
//   DAD=<id> YOU=<id> OUT=x.mp3 node scripts/call.mjs
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const KEY = fs.readFileSync(`${process.env.HOME}/Desktop/projects/media-generator/apps/api/.dev.vars`, 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const DAD = process.env.DAD || 'iP95p4xoKVk53GoZ742B'; // Chris: charming, down-to-earth
const YOU = process.env.YOU || 'OpvjiNROg0EnUm1CX4XP'; // Veda Sky, also the film's narrator
const OUT = process.env.OUT || 'public/audio/call.mp3';

export const CALL = [
  [YOU, '[panting] Hey, Dad! [breathing heavily] I’m out on a run, and I didn’t bring my earphones, [huffs] so you’re on speaker.'],
  [DAD, '[warmly] That’s alright. Did you ever start those ads for your app?'],
  [YOU, '[exhales sharply] Not yet. [panting] I don’t really know how ads work, and I don’t want to burn money.'],
  [DAD, 'Look up Andrew Chen. He led rider growth at Uber, and he writes about how apps grow. Your cousin swears by him.'],
  [YOU, '[breathing heavily] Okay, I’ll check it later. [huffs] Talk later, Dad. Bye!'],
];

const tmp = `${OUT}.parts`;
fs.mkdirSync(tmp, {recursive: true});
const post = async (path, body) => {
  const res = await fetch(`https://api.elevenlabs.io/v1/${path}`, {method: 'POST', headers: {'xi-api-key': KEY, 'content-type': 'application/json'}, body: JSON.stringify(body)});
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res;
};

const [dialogue, bed] = await Promise.all([
  post('text-to-dialogue/with-timestamps?output_format=mp3_44100_128', {model_id: 'eleven_v3', inputs: CALL.map(([voice_id, text]) => ({voice_id, text}))}).then((r) => r.json()),
  post('sound-generation?output_format=mp3_44100_128', {text: 'Jogging outdoors in a quiet park: steady running footsteps on a paved path, light wind, distant birds. No music, no voices.', duration_seconds: 22, prompt_influence: 0.5}).then((r) => r.arrayBuffer()),
]);
fs.writeFileSync(`${tmp}/voice.mp3`, Buffer.from(dialogue.audio_base64, 'base64'));
fs.writeFileSync(`${tmp}/bed.mp3`, Buffer.from(bed));

// Cut at each turn and leave a real phone-call beat between turns (the dialogue model barely pauses,
// and diarization then merges speakers). Dad's turns go through a phone speaker (220–4500 Hz, light
// compression); hers stay close to the mic.
const turns = dialogue.voice_segments.reduce((list, s) => {
  const last = list[list.length - 1];
  if (last && last.voice === s.voice_id) last.end = s.end_time_seconds;
  else list.push({voice: s.voice_id, start: s.start_time_seconds, end: s.end_time_seconds});
  return list;
}, []);
const GAP = 0.6;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${tmp}/voice.mp3`, '-stream_loop', '-1', '-i', `${tmp}/bed.mp3`, '-filter_complex', [
  `[0:a]asplit=${turns.length}${turns.map((_, i) => `[s${i}]`).join('')}`,
  ...turns.map((t, i) => `[s${i}]atrim=start=${t.start.toFixed(3)}:end=${(turns[i + 1]?.start ?? t.end + 1).toFixed(3)},asetpts=PTS-STARTPTS${t.voice === DAD ? ',highpass=f=220,lowpass=f=4500,acompressor=threshold=-18dB:ratio=2,volume=1.25' : ''},apad=pad_dur=${GAP}[t${i}]`),
  `${turns.map((_, i) => `[t${i}]`).join('')}concat=n=${turns.length}:v=0:a=1[voice]`,
  `[1:a]volume=0.22[bg]`,
  `[voice][bg]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]`,
].join(';'), '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', OUT]);
// each turn's place in the final take, for the film's transcript
let at = 0;
fs.writeFileSync(OUT.replace(/\.mp3$/, '.turns.json'), JSON.stringify(turns.map((t, i) => {
  const len = (turns[i + 1]?.start ?? t.end + 1) - t.start;
  const out = {who: t.voice === DAD ? 'Dad' : 'You', start: +at.toFixed(2), end: +(at + t.end - t.start).toFixed(2)};
  at += len + GAP;
  return out;
}), null, 1));

const form = new FormData();
form.append('model_id', 'scribe_v1');
form.append('file', new Blob([fs.readFileSync(OUT)]), 'call.mp3');
const stt = await (await fetch('https://api.elevenlabs.io/v1/speech-to-text', {method: 'POST', headers: {'xi-api-key': KEY}, body: form})).json();
console.log(OUT, /andrew chen/i.test(stt.text ?? '') ? 'HEARS Andrew Chen' : 'MISSES Andrew Chen', '\n', stt.text);
