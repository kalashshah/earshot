# Earshot

**A private memory of everything you say out loud.** Earshot runs on your Apple Watch, captures the conversations you have through the day, and turns them into memory you can ask about, promises it drafts follow-ups for, and a cited morning brief. Every model call is **NVIDIA Nemotron on Nebius Token Factory**, and every fresh fact from the web comes through **Tavily**.

For founders, consultants and anyone whose day is back-to-back conversations: promises made out loud are lost by evening. Earshot surfaces every one by morning, with the evidence.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE) · **Demo:** https://earshot.keronlabs.com · **Video:** `VIDEO_URL` · Built for the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/), Personal AI track.

## How it works

```
 Apple Watch ──WatchConnectivity──▶ iPhone ──HTTPS──▶ Cloudflare Worker (server/)
 voice-gated clips                  background        │
                                    upload            ├─ R2: audio, deleted right after transcription
                                                      ├─ Deepgram Nova-3: diarized transcript
                                                      ├─ Nemotron 3 Super ─▶ facts, people, commitments (JSON)
                                                      │     └─▶ MemoryHQ: each fact stored with its time + clip id
                                                      ├─ Nemotron 3 Super ─▶ drafted follow-up for every promise you made
                                                      └─ nightly cron
                                                            ├─ Lightning decides what's worth looking up
                                                            ├─ Tavily search → extract → Lightning condenses → memory (cited)
                                                            └─ Nemotron 3 Ultra reads the whole day (1M ctx) ─▶ morning brief
 Watch "Ask" ─▶ POST /ask ─▶ memory search + Lightning picks conversations ─▶ Super reads them ─▶ cited answer
 iPhone calendar ─▶ POST /prep ─▶ memory + promises + Tavily news ─▶ Super ─▶ notification on your wrist before the meeting
 Web app (web/, Next.js on OpenNext) ─▶ record or upload a voice note, brief, promises, ask, timeline, memory, privacy
```

## How Earshot uses Nebius Token Factory and NVIDIA Nemotron

All calls go to `https://api.tokenfactory.nebius.com/v1/chat/completions` from [`server/src/llm.ts`](server/src/llm.ts). Each tier is chosen for a reason:

| Job | Model | Why this tier | Thinking |
|---|---|---|---|
| Per-clip extraction (title, summary, people, orgs, facts, commitments) | `nvidia/nemotron-3-super-120b-a12b` | Who-promised-what is the product. On the staged day Lightning swapped owners in about half the group conversations, Super in about 1 of 10, at ~$0.001 vs ~$0.0002 per clip | off (JSON) |
| Picking which conversations answer a question (reads a one-line index of every recent conversation), search planning, condensing web pages | `nvidia/Nemotron-3_5-Lightning` | Cheap and fast; the 1M context holds months of conversation index | off |
| Answering a question from the chosen transcripts | `nvidia/nemotron-3-super-120b-a12b` | Must get who-said-what right (see results) | off |
| Drafting follow-ups, pre-meeting cards | `nvidia/nemotron-3-super-120b-a12b` | Writing quality matters; a few calls a day | off |
| Morning brief over the whole day | `nvidia/Nemotron-3-Ultra-550b-a55b` | A full day of transcripts in one 1M-token pass; Super's 256K cap on Nebius doesn't fit a long day | on |

Every call is logged with model, purpose, tokens, latency and dollars (`usage` table), visible in the dashboard and summarized below.

## How Earshot uses Tavily

Tavily is a step Nemotron chooses, not a hard-coded lookup ([`research()` in `server/src/brain.ts`](server/src/brain.ts)):

1. Lightning reads yesterday's conversation summaries and decides which public topics would help you act (up to 3, and "none" is a valid answer). Private people are never searched.
2. **Search** (`topic: news`, `search_depth: advanced`, `chunks_per_source: 3`, last 14 days).
3. **Extract** on the top-scored URL, focused by the same query.
4. Lightning condenses the page into 1–2 sentences for the stated reason, or drops it (`NONE`). Empty or irrelevant results are never stored.
5. Each kept finding is written to memory with its source URL, and cited as `[n]` in the morning brief.

Pre-meeting prep also searches news about the companies of the people you're meeting.

## Measured results

40 questions about a staged founder workday (12 conversations, synthetic voices, uploaded through the real pipeline), graded by Nemotron Super against hand-written answers. Full method, per-answer verdicts and the scripts are in [`server/eval/`](server/eval/).

| System | Accuracy | Made up an answer (of 4 unanswerable) | Latency | $ / question |
|---|---|---|---|---|
| **Earshot** (memory → routed transcripts → Super) | **73%** | 1 | 5.1 s | $0.0008 |
| Lightning, whole day in the prompt | 63% | 2 | 0.5 s | $0.0002 |
| Super, whole day in the prompt | 75% | 0 | 0.9 s | $0.0012 |
| Ultra, whole day in the prompt | 83% | 0 | 2.5 s | $0.0040 |

What this says, honestly:
- **On one short day, pasting everything into Ultra wins.** This staged day is about 3,600 tokens. A real day of talk is more like 30–50k tokens, and a month is over 1M, past every model's context, at about $1+ per question on Ultra. Earshot's cost per question stays flat because it reads at most 7 conversations.
- **Earshot matches Super-with-everything at a third less cost per question** and gets who-said-what right more often (80% vs 60%), because it reads whole conversations in time order.
- **What we changed because of the numbers:** answering from extracted facts alone scored 58% — facts lost who said what and which version came later. Now memory search and a Lightning-read index of every conversation pick the conversations, and Super answers from their transcripts. Per-clip extraction moved from Lightning to Super after Lightning swapped who-owes-whom in about half the group conversations.
- **Running cost:** one staged day costs about $0.09 to ingest ($0.077 Deepgram, ~$0.01 Nemotron), plus about $0.01 for the morning brief on Ultra.
- Synthetic, clean audio; one run; n = 40, so a few points either way is noise. A real recorded day is next.

## Privacy and consent

- **Audio is deleted** from storage the moment it's transcribed. Nothing re-listens later.
- **Transcripts are erased after 30 days** (`RETENTION_DAYS`); the facts and promises extracted from them stay until you forget them.
- **Every memory points to the conversation it came from.** Forgetting a conversation deletes its transcript, its promises and every memory it produced.
- **Export everything** as one JSON file from the dashboard (`GET /export`).
- **Recording is visible and one tap to stop** on the watch; the watch only keeps audio when it detects speech.
- **Egress allow-list:** the Worker talks to exactly four hosts: `api.tokenfactory.nebius.com`, `api.tavily.com`, Cloudflare Workers AI (Deepgram), and MemoryHQ.
- Token Factory's public endpoints run in the "Global" region; a Dedicated endpoint is the production path for data residency.
- Earshot is for recording your own conversations with people who know. Recording laws differ by place; ask first.

## Quick start

```sh
cd server && npm install
npx wrangler d1 migrations apply earshot-db --remote
npx wrangler secret put NEBIUS_API_KEY   # also TAVILY_API_KEY, APP_TOKEN, MEMORYHQ_WORKSPACE, MEMORYHQ_KEY
npx wrangler deploy
```

Apps: `xcodegen` in the repo root, then open `Earshot.xcodeproj`. `Shared/Secrets.swift` (gitignored) holds the API base URL; each iPhone gets its own token by pairing with a code from the website (Settings → Pair your iPhone), and relays it to the watch.

**Judges:** the demo dashboard is pre-loaded with a staged day; the access link is in the Devpost testing instructions.

## Built during the hackathon

First commit: October 7, 2026, inside the submission window. Everything in this repo was written during the hackathon.

## Known limits

- **Transcription is Deepgram Nova-3**, not an NVIDIA model: Token Factory has no speech-to-text route. Every step after the transcript is Nemotron.
- **Battery:** continuous listening on the watch costs battery; the voice gate keeps it to the moments that matter. Measured on a real day: `BATTERY_NOTE`.
- **Speaker names** come from what people say ("thanks, Priya"); without that, they're "someone".
- **Noisy rooms** lower transcript quality, and every downstream step inherits it.
- **One user per deployment.** The demo runs as a separate deployment with its own data.

## Feedback on Nebius and NVIDIA tools

`FEEDBACK` — draft notes from the build, to finish before submitting:
- **Worked well:** the OpenAI-compatible API meant zero SDK; all three Nemotron tiers answered first try; Lightning JSON in ~1–2 s; Ultra wrote a 12-conversation brief in ~30 s for ~$0.01.
- **Gotcha:** Nemotron's default thinking spends the `max_tokens` budget and breaks JSON mode; `chat_template_kwargs: {"enable_thinking": false}` fixes it. Worth a line in the quickstart.
- **Missing:** no reasoning field in responses, so a thinking model's plan can't be inspected or logged; no speech-to-text model on Token Factory.
- **Model choice:** Lightning was noticeably weaker than Super at attributing speakers in multi-person transcripts; Super was worth the 5× for extraction.

## License

AGPL-3.0
