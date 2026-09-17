const { execSync } = require('child_process');
const path = require('path');

const branch = process.argv[2] || 'main';
console.log(`Deploying to Cloudflare Pages project 'kotoba' on branch '${branch}'...`);

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
