// The music bed (ElevenLabs Music), laid from the end of the call to the end card. Key read at
// runtime, never copied here.   node scripts/music.mjs → public/audio/bed.mp3
import fs from 'node:fs';

const KEY = fs.readFileSync(`${process.env.HOME}/Desktop/projects/media-generator/apps/api/.dev.vars`, 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const prompt = process.env.PROMPT || 'Calm, warm instrumental bed for a product film narrated by a young woman. 100 BPM, G major. Soft felt piano, gentle sustained pads, a light muted pulse, no drums until a soft lift in the last 20 seconds, then a clean resolved ending. Minimal, airy, unobtrusive, sits under a voice. No vocals.';
const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192', {
  method: 'POST',
  headers: {'xi-api-key': KEY, 'content-type': 'application/json'},
  body: JSON.stringify({prompt, music_length_ms: Number(process.env.MS || 106000), force_instrumental: true}),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
fs.writeFileSync(process.argv[2] || 'public/audio/bed.mp3', Buffer.from(await res.arrayBuffer()));
console.log('ok');
