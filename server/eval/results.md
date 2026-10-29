# Earshot eval — 2026-10-17

12 synthetic conversations, 40 questions (7 fact, 5 who, 8 commitment, 8 number, 4 temporal, 4 synthesis, 4 unanswerable).

| System | Accuracy | Hallucination (unanswerable) | Mean latency | $ / question | $ / day | Errors |
|---|---|---|---|---|---|---|
| Earshot (/ask, memory) | 73% | 25% | 5.12 s | $0.00076 | $0.4218 | 0 |
| Lightning, full day in prompt | 63% | 50% | 0.45 s | $0.00024 | $0.0095 | 0 |
| Super, full day in prompt | 75% | 0% | 0.88 s | $0.00119 | $0.0478 | 0 |
| Ultra, full day in prompt | 83% | 0% | 2.49 s | $0.00397 | $0.1589 | 0 |

## Accuracy by question type

| System | fact | who | commitment | number | temporal | synthesis | unanswerable |
|---|---|---|---|---|---|---|---|
| Earshot (/ask, memory) | 57% | 80% | 63% | 100% | 50% | 75% | 75% |
| Lightning, full day in prompt | 71% | 20% | 75% | 100% | 50% | 25% | 50% |
| Super, full day in prompt | 71% | 60% | 63% | 100% | 75% | 50% | 100% |
| Ultra, full day in prompt | 71% | 60% | 75% | 100% | 100% | 75% | 100% |

## Method

- Day: 12 scripted conversations rendered with macOS `say` (synthetic TTS voices), uploaded through the real `PUT /recordings` path, transcribed by Deepgram Nova-3 and extracted into MemoryHQ by Nemotron Lightning — the same pipeline as the watch.
- Earshot = `POST /ask`: memory search (top 15) + open commitments → Nemotron Lightning. Baselines get every transcript of the day (≈3614 tokens) in the prompt, same instructions, thinking off, temperature 0.
- Judge: nvidia/nemotron-3-super-120b-a12b, thinking off, JSON mode, against hand-written gold answers. Unanswerable questions count as correct only when the system declines; hallucination = unanswerable questions answered anyway. LLM judges can err; per-answer verdicts and reasons are in results.json.
- $ / day = 40 questions; Earshot adds its real ingest cost for 2026-10-17 from `GET /usage` ($0.3912: Deepgram + extraction + follow-up drafts). Baselines reuse Earshot's transcripts, so they exclude transcription cost. Earshot's /ask cost is the /usage delta over the run ($0.0306), so other traffic during the run would inflate it.
- Prices per 1M tokens in/out: Lightning $0.06/$0.24, Super $0.30/$0.90, Ultra $1/$3. Judge spend (not counted above): $0.0143.
- Single run, n = 40 per system: differences of a few points are noise.
