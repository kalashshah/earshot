# Earshot demo film

Spec: 1920x1080@60, ~2:32, 100BPM, pace: calm, audio: the real call audio (ElevenLabs voices) + earshot kit (calm), no music.

- Product: Earshot, an Apple Watch app that remembers your conversations. Nemotron on Nebius Token Factory does extraction, Ask, prep and the brief; Tavily does research; Deepgram Nova-3 transcribes.
- Destination: Devpost submission video (YouTube, public). Judges watch at most 3:00. Rules: show the project working on the device it was built for; no copyrighted music; no third-party trademarks without permission.
- Format: UI walkthrough, long form. One chapter per feature, one caption per chapter beat.
- Story: Dad tells you to talk to Andrew Chen about ads. A week later you ask your watch who it was.
- Every Earshot screen is a real capture from the watch and iPhone simulators or the web app, running against the live API. Nothing in a product frame is mocked.

## Hard bans (QA contract)
No eyebrow/kicker labels, no stacked taglines, no "Introducing", no sentence dumped at once, no filler text. No serif, no italic. No neon, glow, bloom, purple/violet/indigo, multi-hue gradients, glassmorphism. No emoji, stock icons, sparkles, particles-as-decoration, confetti, lens flares. No bouncy overshoot on copy.

## Brand-supplied exceptions
- Accent ember #FF4D00 (the app's own `--accent`). Orange is the brand. Meaning: "Earshot heard this / what it remembered".
- The particle orb is the product's own mark (web/src/components/particles.tsx, Shared/ParticleOrb.swift). It is the film's device, not decoration.
- Bricolage Grotesque (web display face) and JetBrains Mono (web mono).
