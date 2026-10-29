# Earshot eval

A scripted founder workday (12 conversations, 09:00–19:00, 2–3 speakers) plus 40 questions with gold answers (`questions.json`: fact, who, commitment, number, temporal, synthesis, and 4 unanswerable).

1. `node eval/check.ts`: checks that every gold answer is grounded in `day.json` (evidence quotes and numbers present, unanswerables really absent).
2. `node eval/synth.ts`: renders `eval/audio/<id>.m4a` with macOS `say` (one voice per speaker) and ffmpeg.
3. `node eval/seed.ts --api https://<worker> --token-env EARSHOT_TOKEN [--day YYYY-MM-DD] [--tz-offset-min 330]`: uploads through `PUT /recordings` with fixed UUIDs, then waits for processing. Re-running is a no-op; to re-seed onto another day, `DELETE /recordings/<id>` first.
4. `node eval/run.ts --api https://<worker> --token-env EARSHOT_TOKEN --nebius-key-env NEBIUS_API_KEY [--max-usd 3] [--ingest-day YYYY-MM-DD]`: writes `results.md` and `results.json`. Each script takes `--dry-run`.

Method notes, honestly:
- The audio is synthetic TTS: clean, with no crosstalk or background noise. Real watch audio will transcribe worse.
- Answers are graded by an LLM judge (Nemotron Super) against gold answers. Verdicts and reasons are in `results.json`, so spot-check them.
- One day is about 4k tokens, so the full-context baselines are an upper bound. Earshot's memory route is what still works at 30 days of talk, where the full-context prompt does not.
- Run `run.ts` on the day you seeded, on a quiet deploy: Earshot's ingest and `/ask` cost come from `GET /usage`, which counts every call that day.
