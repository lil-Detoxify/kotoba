# Cloudflare Pages + R2 deployment

The web app is configured as a Pages project named `kotoba`, with a private R2
bucket named `kotoba-assets` bound as `KOTOBA_R2`. Pages Functions proxy the
dictionary shards and pronunciation files so the bucket itself does not need a
public URL. Dictionary responses are immutable for one day in browsers and
seven days at the edge; audio responses are immutable for one year.

Dictionary objects use a version prefix (`dictionary/v1/...`). Increment the
version in `wrangler.jsonc` and `KOTOBA_DATA_VERSION` when replacing data so
immutable caches cannot mix releases.

## First-time account setup

The Cloudflare account must have R2 enabled in the Dashboard before the bucket
can be created. Once enabled, run these commands from the repository root:

```powershell
npm run upload:r2
npm run build:cloudflare
npx wrangler pages project create kotoba --production-branch main
npx wrangler pages deploy dist-cloudflare --project-name kotoba --branch main
```

The Pages project must have the `KOTOBA_R2` binding configured to
`kotoba-assets` (the checked-in `wrangler.jsonc` is the source of truth for
Wrangler based deployments). The cloud build removes only numeric dictionary
shards and audio files from the static upload; license, notice, manifest, and
table-license files remain. Local development still serves the original files
from `apps/web/public`.

## Wrangler authentication and deployment

The Cloudflare API integration can create the Pages project and R2 bucket, but
local R2 uploads and Pages deployments run through Wrangler. On Windows, run
this once from the repository root and complete the Cloudflare browser login:

```powershell
$env:XDG_CONFIG_HOME = (Join-Path (Get-Location) '.xdg-config')
npx wrangler login
```

Then run the real upload and deploy sequence:

```powershell
npm run upload:r2
npm run build:cloudflare
npx wrangler pages deploy dist-cloudflare --project-name kotoba --branch main
```

The upload script uses `--remote` and the project-pinned Wrangler dependency.
The Functions type check is included in `npm run build:cloudflare`; route tests
are covered by `npm test`.

## Current account state

As of 2026-09-17, the connected account contains the Pages project `kotoba`
(`kotoba-iuz.pages.dev`) and the R2 bucket `kotoba-assets`. Production is
deployed at `https://kotoba-iuz.pages.dev`; the current immutable deployment
URL is `https://eacaebab.kotoba-iuz.pages.dev` (production alias:
`https://kotoba-iuz.pages.dev`). Remote verification completed 2026-09-17:

- R2 `kotoba-assets`: 18,072 objects and 138,762,624 bytes; local sizes and
  MD5 ETags match with 0 missing, wrong-size, wrong-ETag, or extra objects.
- Production A/C sample audio returns `HEAD`/`GET` 200 with matching local
  binary SHA-256; missing audio returns 404.
- `LICENSE.md`, `NOTICE.md`, and `table-licenses.json` return 200.
- `/api/v1/capabilities` returns 200 with `enabled:false`, `/api/v1/session`
  returns anonymous 200, `/api/v1/sync` returns 501, and unknown API paths
  return 404.

The deployed worker serves dictionary and audio objects through R2, returns
the five dictionary metadata/license files from Pages static assets, and keeps
the API contract honest: `/api/v1/capabilities` reports disabled, `/api/v1/session`
reports anonymous state, `/api/v1/sync` returns 501, and unknown API paths return
JSON 404.
