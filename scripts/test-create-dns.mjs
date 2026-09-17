import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const cfg = readFileSync(resolve(root, '.xdg-config/.wrangler/config/default.toml'), 'utf8');
const token = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
const zoneId = 'b4c34fbe3db3bfe26e4ae6b970f673db';

async function main() {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'CNAME',
      name: 'kotobud.com',
      content: 'kotoba-iuz.pages.dev',
      proxied: true
    })
  });
  const data = await res.json();
  console.log('DNS create result:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
