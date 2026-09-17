# Kotoba Windows

Electron hosts the shared Web production build using the secure `kotoba://app` scheme. It does not start a web server or require Node.js on the user's machine. All dictionary shards and demonstration audio are packaged.

Build from repository root: `npm run build:windows`.
Outputs: `release/Kotoba-0.3.0-Windows-x64-Setup.exe` and `release/Kotoba-0.3.0-Windows-x64-Portable.exe`.

The user profile is stored in Electron's app-specific userData directory (`%APPDATA%/kotoba-desktop` by default). It is separate from the browser's IndexedDB. Uninstall keeps learning data. The portable EXE is no-install, but still stores data in the user's profile.

Publisher signing is not configured. The package is unsigned. Windows 10/11 x64 is the target; other platforms are not validated.

Security: sandboxed renderer, no Node integration or preload bridge, bounded static protocol, external HTTPS links open in the system browser, other external navigation denied. Core algorithms are unchanged.

Textbook status: the six requested Standard Japanese textbooks are not bundled without a verified reusable dataset. See docs/TEXTBOOK_SOURCES.md; use the existing CSV/JSON import flow for user-supplied authorized vocabulary.
