import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const cfg = readFileSync(resolve(root, '.xdg-config/.wrangler/config/default.toml'), 'utf8');
const token = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
const accountId = 'e6c9391d2db1f8bd128045c3700fb766';

async function main() {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/kotoba/domains/kotobud.com/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Retry status:', res.status, await res.text());
}

main().catch(console.error);
