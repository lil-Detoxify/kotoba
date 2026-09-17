# Google Cloud Text-to-Speech / Kotoba 10-word test research

Research date: 2026-09-16. Sources are Google Cloud first-party documentation only. No synthesis request or API key was used.

## Confirmed voice names

The official supported voices table lists all four requested Japanese premium voices:

- `ja-JP-Wavenet-A` — female
- `ja-JP-Wavenet-B` — female
- `ja-JP-Wavenet-C` — male
- `ja-JP-Wavenet-D` — male

Source: [Supported voices and languages](https://cloud.google.com/text-to-speech/docs/voices) (Japanese (Japan), Premium, `ja-JP`).

## Japanese pronunciation / SSML

Japanese pronunciation must use the `yomigana` alphabet. Official examples use the form:

```xml
<speak>
  <phoneme alphabet="yomigana" ph="ちゅう">中</phoneme>
  <phoneme alphabet="yomigana" ph="なか">中</phoneme>
</speak>
```

The `ph` value is the reading for the enclosed written word. Hiragana and katakana are both supported, and compound words are supported with automatic segmentation. The same official page documents optional pitch notation: `^` starts a pitch phrase and `!` marks the downstep, e.g. `^は!し`. Do not infer or invent pitch accents from the spelling; when the test only needs a reliable reading, omit pitch marks and use the plain reading in `ph`.

Source: [Supported phonemes and accents](https://cloud.google.com/text-to-speech/docs/phonemes?hl=ja). General SSML reference: [Speech Synthesis Markup Language (SSML)](https://docs.cloud.google.com/text-to-speech/docs/ssml?hl=ja).

### Execution recommendation

For each vocabulary item, generate valid SSML with escaped XML text and one `<phoneme>` around the kanji/word whose reading is known:

```xml
<speak><phoneme alphabet="yomigana" ph="かんじ">漢字</phoneme></speak>
```

Use the request's `input.ssml` field and `voice.languageCode: "ja-JP"`, with one of the four exact voice names. Keep each request under the 5,000-byte content limit. If SSML parsing or phoneme behavior cannot be validated safely, use `input.text` containing the hiragana reading as the reliable fallback; this loses the original kanji display but avoids guessing pronunciation. Do not add pitch markers unless a trusted lexical source supplies them.

## Authentication: API key versus ADC

Google's general authentication guide says each Google API request needs a valid access token or an API key **where that API accepts API keys**, and recommends client libraries with Application Default Credentials (ADC). The Cloud TTS authentication page specifically documents client libraries and REST with gcloud credentials or ADC; it does not document a Cloud TTS-specific API-key flow. Therefore treat API-key support for this test as unconfirmed by the TTS docs and prefer ADC/OAuth access tokens.

ADC searches, in order: `GOOGLE_APPLICATION_CREDENTIALS`, the local file created by `gcloud auth application-default login`, then an attached service account. ADC credentials are distinct from ordinary gcloud CLI credentials. API keys do not use a JSON credential file; a standard API key identifies a project for billing/quota but not an IAM principal.

Sources: [Authenticate to Cloud TTS](https://docs.cloud.google.com/text-to-speech/docs/authentication), [How ADC works](https://docs.cloud.google.com/docs/authentication/application-default-credentials), [Authentication use cases](https://docs.cloud.google.com/docs/authentication/use-cases?authuser=09), [Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys), [Set up ADC](https://docs.cloud.google.com/docs/authentication/provide-credentials-adc).

## Input limits and billing

- Cloud TTS accepts either raw `text` or SSML input: [Create voice audio files](https://docs.cloud.google.com/text-to-speech/docs/create-audio).
- Content limit is **5,000 bytes per request**. For `ja-JP`, one character can occupy multiple bytes, so split by encoded byte length, not merely JavaScript/Python string length: [Quotas & limits](https://docs.cloud.google.com/text-to-speech/quotas).
- Billing is based on characters sent for synthesis. Spaces and newlines count. SSML tags count too, except `<mark>`; Japanese UTF-8 multibyte representation is still charged as one character rather than multiple bytes: [Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing).
- WaveNet has a monthly free usage limit of 0–1,000,000 characters. After that, the listed price is **US$0.000016/character (US$16 per million)**. Google notes that billing must be enabled to use TTS, but usage within the free quota is not charged: [Get started](https://docs.cloud.google.com/text-to-speech/docs/get-started), [Pricing](https://cloud.google.com/text-to-speech/pricing).

### 9,117-word / four-voice estimate

“9,117 words” is not itself a billing unit. Let `C` be the exact number of billable characters in one serialized request set (including spaces/newlines and SSML tags, excluding only `<mark>` tags). One voice costs `max(0, C - remaining_free_chars) * $0.000016`; four voices cost approximately `4*C` characters, subject to the project's/account's remaining monthly free allowance. A conservative upper-bound estimate before free allowance is `4*C*$0.000016 = C*$0.000064` (USD). Count the actual generated SSML/text payload, and account for multiple requests caused by the 5,000-byte limit. The free allowance is monthly, so a one-off test is normally $0 while under the remaining 1M WaveNet characters, but billing must still be enabled.

## Handoff checklist

1. Verify ADC is available for the selected Google Cloud project; do not print or commit credentials.
2. Build four separate test runs using the exact voice names above.
3. Chunk by UTF-8 byte length <= 5,000, with valid `<speak>` boundaries per request.
4. For known kanji readings, use `alphabet="yomigana"` and plain `ph` reading; omit pitch marks unless supplied by a trusted source.
5. Record exact input character counts and voice names. Do not claim API-key authentication works unless an official TTS API reference or a safe, authorized request confirms it.
