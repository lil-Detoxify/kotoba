# Windows round 27 candidate

This is an isolated test candidate. It has not been uploaded or published. The
official Windows download remains on version 0.7.3. Native acceptance of this
rebuilt candidate passed on 2026-10-14 in an isolated profile, using the actual
packaged executable under normal desktop process permissions. See
`electron-packaged-final.json` and `windows-dictionary.png`.

The package version is `0.9.0-beta.1`; the embedded Web UI is `0.9.0` from the
completed `dist-cloudflare` build. Both artifacts target Windows x64:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `KotoBud-0.9.0-beta.1-Windows-x64-Portable.exe` | 183,502,987 bytes | `e7c8a58690be5681873b3a8069ecff666c11ae0c155a49cba6e4366a25761ac0` |
| `KotoBud-0.9.0-beta.1-Windows-x64-Setup.exe` | 183,734,945 bytes | `76670e4d7b5cc5fb415e7bd137f645211480b69dd41b67a5348d8c6653ce22b3` |

The hashes are also recorded in `SHA256SUMS`. The candidates were rebuilt with
electron-builder 26.15.3 and Electron 44.3.0 using
`review/windows/electron-builder.yml`; publishing was disabled. That config is
standalone and writes only to `review/windows/packages`, with
`review/windows/web` as its only `extraResources` entry.

Static package verification passed: the packaged Web tree matches the staged
tree across all 888 files; packaged `index.html` is byte-identical to staged
`app.html`; `assets/main-HbacATkW.js` has SHA-256
`b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295`; all 512
numeric legacy dictionary shards are present, including `dictionary/487.json`;
and Wiktionary `2026-10-12/231.json` is present. The packaged `app.asar`
manifest reports version `0.9.0-beta.1` and entry point `main.cjs`.

The earlier candidate had inherited the root builder's old Web resources and
contained the 0.7.3 UI. This candidate replaces those artifacts. No Electron
process was started during this rebuild or static verification.

The initial restricted test runner produced GPU child-process failures and the
reported Windows exception dialog. The same Electron runtime and final packaged
app ran without that failure outside the restricted runner; normal application
hardware-acceleration settings were left unchanged. Hidden-window background
throttling was disabled only inside the test process. Test capture uses Electron
`capturePage` with `stayHidden: true`.

Native checks confirmed package 0.9.0-beta.1, Web UI 0.9.0, the correct approved
main asset, legacy and Wiki local JSON responses, all three dictionary sources,
zero scoring actions and no GPU failure. Normal user profiles were not opened,
and each temporary test profile was removed. The installer was not executed to
replace an existing user installation.
