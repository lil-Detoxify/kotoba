import {readFileSync} from 'node:fs';
const cfg = readFileSync('.xdg-config/.wrangler/config/default.toml', 'utf8');
const token = cfg.match(/oauth_token = "([^"]+)/)?.[1];
const key = '052850df19e2603b5b2b604568f8cbb307e6c33a307fa604dec38ec323930142.mp3';
const body = readFileSync(`apps/web/public/audio/google/v1/a/${key}`);
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/e6c9391d2db1f8bd128045c3700fb766/r2/buckets/kotoba-assets/objects/audio/google/v1/a/${key}`, {method:'PUT', headers:{Authorization:`Bearer ${token}`, 'content-type':'audio/mpeg'}, body});
console.log(`status=${response.status} body=${(await response.text()).slice(0,160)}`);
