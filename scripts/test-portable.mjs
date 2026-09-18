import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';

const profile = path.resolve('.cache/portable-qa-' + Date.now());
mkdirSync(profile, {recursive: true});
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
const port = Number(process.env.KOTOBA_TEST_PORT ?? (9200 + Math.floor(Math.random() * 500)));
const executable = process.env.KOTOBA_TEST_EXE ?? `release/Kotoba-${process.env.KOTOBA_TEST_VERSION ?? '0.6.0'}-Windows-x64-Portable.exe`;
const launch = () => spawn(path.resolve(executable), [
  '--kotoba-test', '--kotoba-profile=' + profile,
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port
], {windowsHide: true, stdio: 'ignore', env});
let processHandle = launch();
let browser;
const readStoredData = page => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open('kotoba-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  return new Promise((resolve, reject) => {
    const store = db.transaction('app').objectStore('app');
    const req1 = store.get('data_guest');
    req1.onsuccess = () => {
      if (req1.result) { db.close(); resolve(req1.result); return; }
      const req2 = store.get('data');
      req2.onsuccess = () => { db.close(); resolve(req2.result); };
      req2.onerror = () => { db.close(); reject(req2.error); };
    };
    req1.onerror = () => reject(req1.error);
  });
});
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(500)});
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw Error('Portable debugging endpoint unavailable');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {timeout: 60000});
  const page = browser.contexts()[0].pages()[0];
  await expect(page.getByRole('heading', {name: '今天，也学一点吧。'})).toBeVisible({timeout: 60000});
  const dictionaryCount = await page.evaluate(async () => (await (await fetch('/dictionary/manifest.json')).json()).entries);
  expect(dictionaryCount).toBe(217538);
  await page.getByRole('link', {name: '词书', exact: true}).click();
  for (const title of ['标日初级上', '标日初级下', '标日中级上', '标日中级下', '标日高级上', '标日高级下']) {
    await expect(page.getByRole('heading', {name: title, exact: true})).toBeVisible();
  }
  await page.getByRole('heading', {name: '标日初级下', exact: true}).click();
  await expect(page.getByRole('option', {name: '25 课', exact: true}).first()).toBeAttached();
  await page.locator('select').nth(0).selectOption('25');
  await page.locator('select').nth(1).selectOption('48');
  await page.getByRole('button', {name: '选择范围'}).click();
  await expect(page.locator('.selection-footer')).toContainText('已选 24 课');
  await page.getByRole('link', {name: '我的词书', exact: true}).click();
  await page.getByRole('heading', {name: '日语测试词书', exact: true}).click();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', {name: '开始学习所选课程'}).click();
  await page.getByRole('button', {name: '显示释义'}).click();
  await expect(page.locator('.dictionary-entry').first()).toBeVisible();
  await page.evaluate(async () => { const audio = new Audio('/audio/0.mp3'); await audio.play(); audio.pause(); });
  await page.getByRole('button', {name: '记得', exact: false}).click();
  const savedData = await readStoredData(page);
  expect(savedData.logs).toHaveLength(1);
  const savedWordId = savedData.logs[0].wordId;
  const savedState = savedData.states.find(state => state.wordId === savedWordId && state.userId === 'local');
  expect(savedState.reviewCount).toBe(1);
  expect(savedState.nextReviewAt).toEqual(expect.any(String));
  await page.getByRole('link', {name: '结束本次学习'}).click();
  await page.getByRole('link', {name: '今日', exact: true}).click();
  await expect(page.locator('.metric-row')).toContainText('1');
  await page.getByRole('link', {name: '词书', exact: true}).click();
  await page.getByRole('heading', {name: '标日高级下', exact: true}).click();
  await page.getByRole('button', {name: '删除词书'}).click();
  await page.getByRole('button', {name: '确认删除'}).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByRole('heading', {name: '标日高级下', exact: true})).toHaveCount(0);
  const session = await browser.newBrowserCDPSession();
  await Promise.race([session.send('Browser.close').catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
  processHandle.kill();
  await new Promise(resolve => setTimeout(resolve, 1500));
  processHandle = launch();
  let restarted = false;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(500)});
      if (response.ok) { restarted = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!restarted) throw Error('Portable restart debugging endpoint unavailable');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {timeout: 60000});
  const restartedPage = browser.contexts()[0].pages()[0];
  await expect(restartedPage.getByRole('heading', {name: '今天，也学一点吧。'})).toBeVisible({timeout: 60000});
  await restartedPage.getByRole('link', {name: '词书', exact: true}).click();
  for (const title of ['标日初级上', '标日初级下', '标日中级上', '标日中级下', '标日高级上']) {
    await expect(restartedPage.getByRole('heading', {name: title, exact: true})).toBeVisible();
  }
  await expect(restartedPage.getByRole('heading', {name: '标日高级下', exact: true})).toHaveCount(0);
  const restartedData = await readStoredData(restartedPage);
  expect(restartedData.logs).toHaveLength(1);
  expect(restartedData.logs[0].wordId).toBe(savedWordId);
  const restartedState = restartedData.states.find(state => state.wordId === savedWordId && state.userId === 'local');
  expect(restartedState.reviewCount).toBe(1);
  expect(restartedState.nextReviewAt).toEqual(expect.any(String));
  expect(restartedData.textbooksVersion).toBe('biaori-v1');
  expect(restartedData.books.some(book => book.id === 'biaori-advanced-lower')).toBe(false);
} finally {
  await Promise.race([browser?.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
  processHandle.kill();
}
console.log('PASS: final portable EXE six textbooks, range selection, dictionary, MP3, learning persistence, deletion marker and restart path');
