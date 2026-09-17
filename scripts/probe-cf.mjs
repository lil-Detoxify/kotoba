import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const cfg = readFileSync(resolve(root, '.xdg-config/.wrangler/config/default.toml'), 'utf8');
const token = cfg.match(/oauth_token = "([^"]+)"/)?.[1];
if (!token) throw new Error('No token found');

const accountId = 'e6c9391d2db1f8bd128045c3700fb766';

async function main() {
  console.log('--- 1. Querying Zones ---');
  const zonesRes = await fetch('https://api.cloudflare.com/client/v4/zones', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const zonesData = await zonesRes.json();
  console.log('Zones Success:', zonesData.success);
  if (zonesData.result) {
    for (const z of zonesData.result) {
      console.log(`Zone: ${z.name} | ID: ${z.id} | Status: ${z.status} | Plan: ${z.plan?.name}`);
    }
  } else {
    console.log('Zones errors:', zonesData.errors);
  }

  console.log('--- 2. Querying Pages Project "kotoba" ---');
  const projRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/kotoba`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const projData = await projRes.json();
  console.log('Project Success:', projData.success);
  if (projData.result) {
    const p = projData.result;
    console.log('Project Name:', p.name);
    console.log('Subdomain:', p.subdomain);
    console.log('Production Branch:', p.production_branch);
    console.log('Domains:', p.domains);
    console.log('Production Script:', p.production_script_name);
    console.log('Deployments configs:', JSON.stringify(p.deployment_configs, null, 2));
  } else {
    console.log('Project errors:', projData.errors);
  }

  console.log('--- 3. Querying Pages Custom Domains ---');
  const domainsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/kotoba/domains`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const domainsData = await domainsRes.json();
  console.log('Custom Domains:', domainsData.result);
}

main().catch(console.error);
