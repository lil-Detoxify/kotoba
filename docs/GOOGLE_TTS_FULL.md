# Google TTS full audio

Generated 2026-09-17 with Google Cloud Text-to-Speech ADC project `gen-lang-client-0118344750`.

- Source: six textbook books, 9,117 raw rows.
- De-duplication: exact `term + reading`, yielding 9,036 unique entries.
- Voices: `ja-JP-Wavenet-A` (female) and `ja-JP-Wavenet-C` (male).
- Input: SSML `yomigana`, plain reading, MP3, speaking rate 1, pitch 0, volume gain 0.
- Output: 18,072 non-zero MP3 files under `apps/web/public/audio/google/v1/{a,c}/`.
- Mapping: `apps/web/src/google-audio-map.json`.
- Final validation: 18,072 files, 0 zero-byte/structural failures, 9,036 map entries, 0 missing mapped files; total bytes 138,762,624.

The generator is resumable at `scripts/generate-google-full.mjs`; progress and request accounting are in `.cache/google-full-progress.json` and `.cache/google-full-manifest.json`. Existing 20 sample files were reused. Historical failed/uncertain attempts remain separately recorded in the manifest totals; the final unique output set is complete.
