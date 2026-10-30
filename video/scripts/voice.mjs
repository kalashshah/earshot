// Narration: Veda Sky (the daughter in the call) on eleven_v4, one clip per beat, with word timings
// from ElevenLabs' alignment. Same recipe as the motion repo's films. Key read at runtime, never copied here.
//   node scripts/voice.mjs            → public/vo/voNN.mp3, src/vo.json
//   node scripts/voice.mjs 5 7        → re-do just those beats
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const KEY = fs.readFileSync(`${process.env.HOME}/Desktop/projects/media-generator/apps/api/.dev.vars`, 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const VOICE = process.env.VOICE || 'OpvjiNROg0EnUm1CX4XP'; // Veda Sky
const MODEL = process.env.MODEL || 'eleven_v4';

// Spoken text; every claim matches what the captures show (the brief, the eval numbers, the privacy page).
export const LINES = [
  'I was mid-run, so the name didn’t stick.',
  'My watch heard it anyway. It hears the rest of my day too: lectures, meetings, chats in multiple languages, and calls like this one. Earshot writes down who said what, and keeps what mattered.',
  'A week later, I couldn’t remember who Dad meant. So I asked my wrist.',
  'Andrew Chen. With the call it came from.',
  'On my wrist, one tap and it listens. And I can ask it about anything I’ve heard.',
  'My phone turns each conversation into a summary, a transcript by speaker, and reminders.',
  'On the web or in the app, I see my whole timeline, my promises, and a brief waiting every morning.',
  'Underneath, it builds a memory. In one Sunday it heard thirteen conversations, an hour and a half of talk, and kept over fifty facts. It merges what it hears twice, researches the people I mention overnight, and turns what I promised into follow-ups it drafts for me.',
  'Under the hood, three Nemotron models run on Nebius Token Factory, one for each job. Lightning picks what to look up, Super pulls out promises and answers questions, and Ultra writes the brief.',
  'On our test set, it answers seventy-three percent of questions right, for less than a tenth of a cent each.',
  'Audio is deleted the moment it’s transcribed. Everything else, I can export or delete.',
  'Earshot. What you heard, there when you need it.',
];

fs.mkdirSync('public/vo', {recursive: true});
const only = process.argv.slice(2).map(Number);
const out = fs.existsSync('src/vo.json') ? JSON.parse(fs.readFileSync('src/vo.json', 'utf8')) : [];

for (const [i, line] of LINES.entries()) {
  if (only.length && !only.includes(i + 1)) continue;
  const n = String(i + 1).padStart(2, '0');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_192`, {
    method: 'POST',
    headers: {'xi-api-key': KEY, 'content-type': 'application/json'},
    body: JSON.stringify({text: line, model_id: MODEL, voice_settings: {stability: 0.45}}),
  });
  if (!res.ok) throw new Error(`${n}: ${res.status} ${await res.text()}`);
  const d = await res.json();
  fs.writeFileSync(`public/vo/vo${n}.mp3`, Buffer.from(d.audio_base64, 'base64'));
  const a = d.alignment;
  const words = [];
  let cur = null;
  a.characters.forEach((ch, k) => {
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    if (!cur) cur = {w: '', s: a.character_start_times_seconds[k], e: a.character_end_times_seconds[k]};
    cur.w += ch; cur.e = a.character_end_times_seconds[k];
  });
  if (cur) words.push(cur);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `public/vo/vo${n}.mp3`]).toString().trim());
  out[i] = {n: i + 1, file: `vo/vo${n}.mp3`, text: line, dur: +dur.toFixed(3), words: words.map((w) => ({w: w.w, s: +w.s.toFixed(3), e: +w.e.toFixed(3)}))};
  console.log(n, dur.toFixed(2) + 's', line.slice(0, 56));
}
fs.writeFileSync('src/vo.json', JSON.stringify(out, null, 1));
console.log('total speech', out.reduce((s, c) => s + (c?.dur ?? 0), 0).toFixed(1) + 's');
