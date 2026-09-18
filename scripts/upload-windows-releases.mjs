import { spawn } from 'node:child_process';
import { statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const xdg = path.resolve('.xdg-config');

const files = [
  {
    local: 'release/Kotoba-0.6.0-Windows-x64-Setup.exe',
    remoteKey: 'kotoba-assets/releases/0.6.0/Kotoba-0.6.0-Windows-x64-Setup.exe',
    name: 'Kotoba-0.6.0-Windows-x64-Setup.exe'
  },
  {
    local: 'release/Kotoba-0.6.0-Windows-x64-Portable.exe',
    remoteKey: 'kotoba-assets/releases/0.6.0/Kotoba-0.6.0-Windows-x64-Portable.exe',
    name: 'Kotoba-0.6.0-Windows-x64-Portable.exe'
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
    'application/octet-stream',
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

console.log('[Upload] All Windows 0.6.0 releases uploaded successfully to Cloudflare R2!');
