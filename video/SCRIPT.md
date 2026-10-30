# Earshot demo film: script and shot list

2:15 at 1920x1080, 60 fps. Veda Sky narrates as the daughter from the call, in the first person (`scripts/voice.mjs`). Every Earshot screen is a recording of the real app (the watch and iPhone simulators, or the website) running against the live API, on the real call.

| Time | Scene | Picture | Narration / caption |
|---|---|---|---|
| 0:00 | Call | The watch listening while Dad's call plays on speaker mid-run. The transcript runs under it; "Andrew Chen" lights up in ember. | "I was mid-run, so the name didn't stick." |
| 0:36 | Heard | iPhone: the Conversations list holds while each real recording is tagged on its word (Lecture, Class, Chat · Hindi and Urdu, Call · on speaker). Then the call opens: the summary, then the transcript split by speaker. | "My watch heard it anyway. It hears the rest of my day too: lectures, meetings, a chat with friends in Hindi, and calls like this one. Earshot writes down who said what, and keeps what mattered." |
| 0:50 | Ask | On the watch: tap the particle "?", type "Who did Dad tell me to look up?" (sped up), Thinking…, then "Andrew Chen." with the call as its source. | Caption: A week later. / "A week later, I couldn't remember who Dad meant. So I asked my wrist." / "Andrew Chen. With the call it came from." |
| 1:14 | Brief | The website's Today page: the Oct 23 brief. Push into People & news, where Tavily's research on Andrew Chen sits with its source. | "The next morning, my brief was waiting. Tavily had already looked him up: an a16z partner who backs young founders." |
| 1:31 | Engine | The pipeline draws itself: Watch → Deepgram Nova-3 → Nemotron (Lightning, Super, Ultra) on Nebius Token Factory → MemoryHQ, with Tavily feeding in. Then three numbers. | Caption: Three Nemotron models, / one per job. 73% answered right. $0.0008 a question. 80% speakers right. / Narration on the three models and the eval. |
| 1:58 | Privacy | The website's Privacy page: audio deleted on transcription, transcripts erased after 30 days, every memory traceable. | "Audio is deleted the moment it's transcribed. Everything else, I can export or delete." |
| 2:07 | End | The orb gathers, and the Earshot name locks beside it. | "Earshot. What you heard, there when you need it." earshot.keronlabs.com |

## The call

She's out on a run with no earphones, so Dad is on speaker and the watch hears both of them. She's busy running, so the name doesn't stick; a week later she asks her watch. `node scripts/call.mjs` makes the take: ElevenLabs text-to-dialogue (eleven_v3) with Chris as Dad and Veda Sky as her (also the narrator), Dad's turns band-limited like a phone speaker, over a running bed from ElevenLabs sound effects. It writes `public/audio/call.mp3` and checks that a transcriber hears "Andrew Chen".

```
You: Hey, Dad! I'm out on a run and didn't bring my earphones, so you're on speaker.
Dad: That's alright. Did you ever start those ads for your app?
You: Not yet. I don't really know how ads work, and I don't want to burn money.
Dad: Look up Andrew Chen. He led rider growth at Uber, and he writes about how apps grow. Your cousin swears by him.
You: Okay, I'll check it later. Talk later, Dad. Bye!
```

## How the captures are made

1. AXe (`/opt/homebrew/bin/axe`) taps, types and reads the simulators; it needs no Accessibility permission. The watch's own keyboard ignores `axe type`, so the question is typed key by key.
2. The iPhone simulator pairs with a pairing code; the watch gets its token from `SIMCTL_CHILD_EARSHOT_TOKEN` (a DEBUG-only hook, since WatchConnectivity is unreliable in the simulator).
3. `call.mp3` goes through the real pipeline with `PUT /recordings/:id` (started 2026-10-23 07:10 IST), then `POST /briefs/run` writes that day's brief.
4. `call.mp4`: the watch listening while `call.mp3` plays out loud. `heard.mp4`: the phone's Conversations and the call. `ask.mp4`: the watch Ask flow, cut to `ask-film.mp4` (typing at 10x, thinking at 2x). `brief.png` and `privacy.png`: full-page captures of the website.
5. `npm run cues && npm run audio` (effects), `bash scripts/mix.sh` (effects + call + narration), then `bash scripts/render.sh Film out/film.mp4 --audio public/audio/mix.wav`.

## YouTube

Title: Earshot: a private memory of every conversation (Nebius x NVIDIA hackathon demo)

Description:
Earshot is an Apple Watch app that remembers your conversations: who said what, who promised what, follow-ups drafted for you, and a cited morning brief. Everything in this video is the real app running against the live server, recorded in the watch and iPhone simulators and the web app. The call is voiced with ElevenLabs.

Built with NVIDIA Nemotron (Lightning, Super and Ultra) on Nebius Token Factory, Deepgram Nova-3 for transcription, Tavily for research and MemoryHQ for memory.

Try it: https://earshot.keronlabs.com
Code: https://github.com/kalashshah/earshot
