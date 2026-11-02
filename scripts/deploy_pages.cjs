const { execSync } = require('child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('path');

const branch = process.argv[2] || 'main';
console.log(`Deploying to Cloudflare Pages project 'kotoba' on branch '${branch}'...`);

if (branch === 'main') {
  const expectedWorker = 'e12624afe1473e1c5c89cd27f4ba57887e57b4d95b73151d12af6a05a4a31097';
  const worker = readFileSync(path.resolve('dist-cloudflare', '_worker.js'));
  const actualWorker = createHash('sha256').update(worker).digest('hex');
  if (actualWorker !== expectedWorker) {
    throw new Error('Production Worker differs from the approved Windows download release. Prepare the same compatible Worker used for staging before production deployment.');
  }
}

const xdg = path.resolve('.xdg-config');
const cmd = `npx wrangler pages deploy dist-cloudflare --project-name kotoba --branch ${branch} --commit-message "deploy ${branch} with kotobud.com domain routing"`;

try {
  const out = execSync(cmd, {
    env: {
      ...process.env,
      XDG_CONFIG_HOME: xdg
    },
    encoding: 'utf8',
    stdio: 'inherit'
  });
  console.log('Deploy completed successfully.');
} catch (e) {
  console.error('Deploy failed:', e.message);
  process.exit(1);
}
