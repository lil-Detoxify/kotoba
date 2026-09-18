import {_electron as electron, expect} from '@playwright/test';
import path from 'node:path';
import {mkdirSync} from 'node:fs';

const profile = path.resolve('.cache/desktop-auth-qa-' + Date.now());
mkdirSync(profile, {recursive: true});

const executable = 'release/win-unpacked/Kotoba.exe';
const app = await electron.launch({
  executablePath: path.resolve(executable),
  args: ['--kotoba-test', '--kotoba-profile=' + profile],
  timeout: 30000
});

try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // 1. Verify Home is visible
  await expect(page.getByRole('heading', {name: '今天，也学一点吧。'})).toBeVisible({timeout: 10000});

  // 2. Verify Windows Download card is NOT shown
  const downloadCard = page.locator('.windows-download');
  await expect(downloadCard).toHaveCount(0);

  // 3. Test API connectivity & CORS from inside kotoba://app
  const corsTest = await page.evaluate(async () => {
    try {
      const res = await fetch('https://kotobud.com/api/v1/capabilities', {
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  console.log('CORS capabilities response from desktop:', JSON.stringify(corsTest));
  expect(corsTest.ok).toBe(true);
  expect(corsTest.data?.capabilities).toContain('d1_sync');

  // 4. Test auth check-account from inside kotoba://app
  const authCheckTest = await page.evaluate(async () => {
    try {
      const res = await fetch('https://kotobud.com/api/v1/auth/check-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'desktop_test@kotobud.com' })
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  console.log('CORS check-account response from desktop:', JSON.stringify(authCheckTest));
  expect(authCheckTest.ok).toBe(true);
  expect(authCheckTest.data?.flow).toBe('register');

  expect(errors).toEqual([]);
  console.log('PASS: Windows desktop runtime verified: NO download card, CORS connectivity passed, check-account passed, 0 page errors.');
} finally {
  await app.close().catch(() => {});
}
