# Kittangle – notes for Claude

Full product context and rules live in the claude.ai project "Kittangle" (project instructions + `claude/status.md`). Key rules:
- Reply to the user in Russian, no "ё", no long dash "—", few colons.
- `src/core` stays pure TS and fully tested (`npm test`); every generated level must be solvable.
- Game code talks to portals/stores only through `src/platform/IPlatform.ts`.
- Small targeted edits; run `npm test` and `npm run build` once per change set.
- Art: current sets v3 (2026-11-19) + v4 (2026-11-23, tools/art/art4.py) made with ChatGPT image generation (OpenAI terms: output owned by the user, commercial use allowed). Older v1–v2 art: Apache-2.0 Qwen-Image only, never Qwen-Image-2.1. Log every batch in tools/art/ASSET_LOG.csv.
- Audio: Stable Audio 3 open weights (Stability AI Community License: free commercial use under USD 1M annual revenue). See tools/audio/CREDITS.md.
