import { spawn } from 'node:child_process';
import { statSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const xdg = path.resolve('.xdg-config');

const pkg = JSON.parse(readFileSync(path.resolve(root, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;

const files = [
  {
    local: `release/KotoBud-${version}-Windows-x64-Setup.exe`,
    remoteKey: `kotoba-assets/releases/${version}/KotoBud-${version}-Windows-x64-Setup.exe`,
    name: `KotoBud-${version}-Windows-x64-Setup.exe`,
    contentType: 'application/octet-stream'
  },
  {
    local: `release/KotoBud-${version}-Windows-x64-Portable.exe`,
    remoteKey: `kotoba-assets/releases/${version}/KotoBud-${version}-Windows-x64-Portable.exe`,
    name: `KotoBud-${version}-Windows-x64-Portable.exe`,
    contentType: 'application/octet-stream'
  },
  {
    local: `release/SHA256SUMS-${version}.txt`,
    remoteKey: `kotoba-assets/releases/${version}/SHA256SUMS-${version}.txt`,
    name: `SHA256SUMS-${version}.txt`,
    contentType: 'text/plain'
  }
];

async function uploadFile(file) {
  if (!existsSync(file.local)) {
    throw new Error(`Local file not found: ${file.local}`);
  }
  const size = statSync(file.local).size;
  console.log(`[Upload] Starting ${file.name} (${size} bytes = ${(size / 1024 / 1024).toFixed(2)} MB) -> ${file.remoteKey}...`);

  const startTime = Date.now();
  const args = [
    'wrangler',
    'r2',
    'object',
    'put',
    file.remoteKey,
    '--file',
    file.local,
    '--content-type',
    file.contentType || 'application/octet-stream',
    '--remote'
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn('npx', args, {
      cwd: root,
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        XDG_CONFIG_HOME: xdg
      }
    });

    proc.on('close', code => {
      if (code === 0) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Upload] SUCCESS: ${file.name} uploaded in ${duration}s.`);
        resolve();
      } else {
        reject(new Error(`wrangler exited with code ${code} for ${file.name}`));
      }
    });

    proc.on('error', err => reject(err));
  });
}

for (const file of files) {
  await uploadFile(file);
}

console.log(`[Upload] All Windows ${version} releases uploaded successfully to Cloudflare R2!`);
