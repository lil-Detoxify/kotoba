# Windows 0.9.1-beta.1 local test candidate · 2026-10-27

This is a local test candidate. The unpacked program was launched for a limited check with a fresh isolated profile. The installer was not run, and no existing installation or profile was replaced. Nothing was uploaded or published.

## Files

- [Windows x64 installer](pack/KotoBud-0.9.1-beta.1-Windows-x64-Setup.exe) — 194,853,558 B; SHA-256 `8053c0d800940e2c7622456f8a1113c1f72f25914db114612aa99c50d192697e`
- [Windows x64 portable package](pack/KotoBud-0.9.1-beta.1-Windows-x64-Portable.exe) — 194,621,644 B; SHA-256 `07b81e57524a57cd4624109204a38d53a56a7ec95d785a4d2f701c6eb9156d8a`
- [SHA256SUMS.txt](SHA256SUMS.txt)
- [Package verification](package-verification.json)
- [Stage verification](stage-verification.json)

## Build contents

The embedded Web UI is **0.9.1**, staged from the frozen `kotobud-review/round55-2026-10-27/site-release` source. Its main asset is `assets/main-Bo62HrWV.js`, SHA-256 `a3029460d50cec5249f3a0a70544cd7548c27adcb418bd4a287906eb11c7d575`.

The isolated Web stage contains 1,293 files / 323,820,468 B. Both `app.html` and `index.html` are byte-for-byte copies of the production `app.html` SPA entry (857 B); the SEO homepage was not staged. The production dictionary manifest matches the repository fallback manifest, and the stage contains all 512 legacy dictionary shards. The large Google audio library is not bundled.

The Windows package version is **0.9.1-beta.1**. NSIS and portable x64 packages were built with the existing Electron 44.3.0 runtime and electron-builder 26.15.3. `main.cjs`, `protocol.cjs`, and `preload.cjs` remain byte-identical to their source files.

## Verification boundary

Both EXE files have valid `MZ` headers. All 1,293 staged Web files match the unpacked package byte-for-byte, including the expected production main asset hash. The ASAR contains Windows version 0.9.1-beta.1 and the unchanged desktop entry files.

The unpacked `KotoBud.exe` passed an isolated, hidden-window runtime check under normal execution permissions: desktop version **0.9.1-beta.1**, Settings Web version **0.9.1**, Japanese lookup for 日本, and comparison showing Tomoshi, JMdict and 维基词典. Both legacy and Wiktionary dictionary shards returned HTTP 200. No scoring, account API writes, renderer crashes or GPU startup failures occurred. The unique temporary profile was removed after exit. See [the final runtime report](electron-normal-permission-final.json) and [the captured dictionary view](windows-dictionary.png).

An earlier restricted-permission attempt did not finish Settings navigation and logged a GPU process failure. A follow-up also corrected a QA-only assertion that looked for the version label in a truncated diagnostic excerpt. Those records remain available as historical diagnostics; the candidate package and desktop runtime source did not change. See [the initial attempt](electron-packaged.json).

This candidate remains unpublished. No installer was run, no existing user installation or profile was replaced, and no files were uploaded to R2.

## Reproduction

From the repository root:

```powershell
node review/windows/2026-10-27/prepare-stage.cjs
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
node node_modules/electron-builder/out/cli/cli.js --config review/windows/2026-10-27/electron-builder.yml --win --x64 --publish never
node review/windows/2026-10-27/verify-package.cjs
```

## Root normal-permission follow-up (2026-10-27)

The same packaged EXE passed the original Settings and three-source local dictionary checks under normal execution permissions, with the window still hidden and a unique temporary profile. No desktop runtime code or package bytes changed. The restricted run had GPU process loading failures; the follow-up also removed an incorrect assertion that searched only the first 700 diagnostic characters for a version label lower on the page. See electron-normal-permission-final.json and windows-dictionary.png. Renderer crashes, GPU startup failures, page errors and API write requests were absent; temporary profile cleanup completed. This is isolated packaged-program acceptance, not installer execution or replacement of a user installation.
