import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(root, '.runtime'), { recursive: true });
const profile = await mkdtemp(path.join(root, '.runtime', 'profile-'));
const executablePath = path.join(root, 'pack', 'win-unpacked', 'KotoBud.exe');
const errors = [];
const steps = [];
let app;

async function launch() {
  app = await electron.launch({ executablePath, args: [`--kotobud-profile=${profile}`, '--kotobud-test'], timeout: 20000 });
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false);
  });
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), '0.10.1-beta.2');
  const page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/u, route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

async function open(page, route, heading) {
  await page.evaluate(hash => { location.hash = hash; }, '#' + route);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
}

try {
  let page = await launch();
  await open(page, '/settings', '设置与关于');
  assert.match(await page.locator('body').innerText(), /0\.10\.1-beta\.2/);
  for (const width of [1280, 1740]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.vocab-ribbon').waitFor({ state: width < 1700 ? 'hidden' : 'visible' });
  }
  for (const [name, selector] of [['课次书签', '.bookmarks'], ['林间微风', '.woodland'], ['流动词带', '.ribbon-window']]) {
    await page.getByRole('radio', { name: new RegExp(name) }).check();
    await page.locator(selector).waitFor();
  }
  steps.push('Settings version and all three widescreen modes');
  await page.evaluate(() => { location.hash = '#/books/biaori-beginner-lower?section=grammar'; });

  await page.locator('a[href="#/grammar/biaori-beginner-lower/48"]').click();
  await page.getByRole('heading', { name: '语法学习', exact: true }).waitFor();
  await page.locator('.outline-practice').click();
  await page.locator('.grammar-options button').first().click();
  await page.getByRole('button', { name: '确认答案' }).click();
  await page.locator('.grammar-feedback').waitFor();
  const feedback = await page.locator('.grammar-feedback').innerText();
  const question = await page.locator('.grammar-practice h2').innerText();
  steps.push('Lower-book directory, lesson 48 and offline answer');
  await app.close();
  page = await launch();
  await open(page, '/grammar/biaori-beginner-lower/48', '语法学习');
  assert.equal(await page.locator('.grammar-feedback').innerText(), feedback);
  assert.equal(await page.locator('.grammar-practice h2').innerText(), question);
  await page.getByRole('button', { name: '下一题' }).click();
  assert.notEqual(await page.locator('.grammar-practice h2').innerText(), question);
  steps.push('Submitted answer and question recovered after complete process restart');
  await open(page, '/kana', '五十音学习');
  await page.evaluate(() => {
    window.__playedMedia = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__playedMedia.push(this); return play.call(this); };
  });
  await page.getByRole('button', { name: '听发音', exact: true }).click();
  await page.waitForFunction(() => window.__playedMedia?.some(media => media.readyState >= 2 && media.currentTime > 0 && !media.error));
  assert.match(await page.evaluate(() => window.__playedMedia[0].src), /^kotoba:\/\/app\/assets\/a-/);
  await page.getByRole('button', { name: '片假名', exact: true }).click();
  await page.getByRole('button', { name: '浊音・半浊音', exact: true }).click();
  await page.getByRole('button', { name: 'パ pa', exact: true }).click();
  await page.getByRole('img', { name: /パ的笔顺/ }).waitFor();
  await page.getByRole('button', { name: '逐笔看', exact: true }).click();
  await page.getByText(/第 1 \/ .* 笔/).waitFor();
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    return image.toPNG().toString('base64');
  });
  await writeFile(path.join(root, 'kana-1280.png'), Buffer.from(png, 'base64'));
  steps.push('Kana playback decoded offline from kotoba assets; katakana and semi-voiced strokes and stepwise replay');
  assert.deepEqual(errors, []);
  await writeFile(path.join(root, 'grammar-acceptance.json'), JSON.stringify({ complete: true, network: 'http(s) blocked at renderer', steps, errors }, null, 2) + '\n');
  console.log(steps);
} finally {
  await app?.close();
}
