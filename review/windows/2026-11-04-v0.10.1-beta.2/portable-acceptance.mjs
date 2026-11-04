import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = import.meta.dirname;
const runtime = await mkdtemp(join(root, '.runtime', 'portable-'));
const temp = join(runtime, 'temp');
const profile = join(runtime, 'profile');
await mkdir(temp);
const exe = join(root, 'pack', 'KotoBud-0.10.1-beta.2-Windows-x64-Portable.exe');
const processHandle = spawn(exe, [`--kotobud-profile=${profile}`, '--kotobud-test', '--remote-debugging-port=0'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, TEMP: temp, TMP: temp },
});

let browser;
try {
  const deadline = Date.now() + 40000;
  let port;
  while (!port && Date.now() < deadline) {
    const activePort = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return '';
    });
    port = Number(activePort.split('\n')[0]);
    if (!port) await delay(250);
  }
  assert(port, 'Portable did not open the debug port in the isolated profile.');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  await context.route(/^https?:/u, route => route.abort());
  const page = context.pages().find(item => item.url().startsWith('kotoba:')) ?? await context.waitForEvent('page', { timeout: 10000 });
  await page.waitForURL('kotoba://app/**', { timeout: 12000 });
  await page.evaluate(() => { location.hash = '#/grammar/biaori-beginner-upper/1'; });
  await page.getByRole('heading', { name: '语法学习' }).waitFor({ timeout: 12000 });
  await writeFile(join(root, 'portable-acceptance.json'), JSON.stringify({ passed: true, isolatedProfile: true, page: page.url() }, null, 2) + '\n');
  console.log('Portable launcher opened offline grammar lesson 1.');
  await page.close();
} finally {
  await browser?.close();
  if (processHandle.exitCode === null) processHandle.kill();
}
