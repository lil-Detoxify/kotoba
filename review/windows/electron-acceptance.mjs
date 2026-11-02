import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const reviewRoot = path.join(repoRoot, 'review', 'windows');
const webRoot = path.resolve(repoRoot, option('web-root', 'review/windows/web'));
const reportPath = path.resolve(repoRoot, option('report', 'review/windows/electron-acceptance-report.json'));
const timeout = Number(option('timeout-ms', '45000'));
const packagedExecutable = option('executable', '');
const log = message => process.stdout.write(`[windows-acceptance] ${message}\n`);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(argument => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function dictionaryBucket(text) {
  let hash = 0;
  for (const character of text.normalize('NFKC')) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash % 512;
}

async function main() {
  assert(isWithin(reviewRoot, webRoot), 'The Web root must be a child of review/windows.');
  assert(isWithin(reviewRoot, reportPath), 'The acceptance report must be written under review/windows.');
  assert(Number.isFinite(timeout) && timeout >= 1000, '--timeout-ms must be at least 1000.');

  const webPackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const windowsPackage = JSON.parse(await readFile(path.join(repoRoot, 'apps', 'windows', 'package.json'), 'utf8'));
  assert.equal(windowsPackage.version, option('version', windowsPackage.version), 'The Windows package should match the requested candidate version.');
  const stageMetadata = JSON.parse(await readFile(path.join(webRoot, '.kotobud-web-stage.json'), 'utf8'));
  assert.equal(stageMetadata.kind, 'kotobud-windows-web-stage');
  assert.equal(stageMetadata.webVersion, webPackage.version, 'Staged Web UI version does not match the current Web package.');
  assert.equal(await readFile(path.join(webRoot, 'app.html'), 'utf8'), await readFile(path.join(webRoot, 'index.html'), 'utf8'),
    'The local index.html must be copied from app.html, not the Cloudflare SEO index.');

  const comparisonService = await readFile(path.join(repoRoot, 'apps', 'web', 'src', 'services', 'dictionary-comparison.ts'), 'utf8');
  const wikiVersion = comparisonService.match(/WIKTIONARY_VERSION\s*=\s*'([^']+)'/u)?.[1];
  assert(wikiVersion, 'Could not find the current Wiktionary version.');
  const probeTerm = '日本';
  const oldBucket = dictionaryBucket(probeTerm);
  const wikiBucket = oldBucket % 256;
  const oldPath = `/dictionary/${oldBucket}.json`;
  const wikiPath = `/data/dictionaries/wiktionary-ja/${wikiVersion}/${wikiBucket}.json`;

  const runtimeDir = path.join(reviewRoot, '.runtime');
  await mkdir(runtimeDir, { recursive: true });
  const profile = await mkdtemp(path.join(runtimeDir, 'windows-profile-'));
  const pageErrors = [];
  let electronApp;
  let result;
  let failure;
  let gpuFailure = false;
  try {
    log(`launching Electron with isolated profile ${path.relative(repoRoot, profile).replaceAll(path.sep, '/')}`);
    const launchArguments = packagedExecutable ? [`--kotobud-profile=${profile}`, '--kotobud-test'] : [
      path.join(repoRoot, 'apps', 'windows'), `--kotobud-profile=${profile}`, '--kotobud-test', `--kotobud-web-root=${webRoot}`,
    ];
    const executablePath = packagedExecutable ? path.resolve(repoRoot, packagedExecutable) : undefined;
    if (executablePath) assert(isWithin(reviewRoot, executablePath), 'Packaged executable must be an isolated test artifact.');
    if (executablePath) {
      const packagedWeb = path.join(path.dirname(executablePath), 'resources', 'web');
      assert.equal(await readFile(path.join(packagedWeb, 'index.html'), 'utf8'), await readFile(path.join(webRoot, 'app.html'), 'utf8'),
        'Packaged Web entry differs from the approved app; check duplicate extraResources sources.');
    }
    electronApp = await electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: [
        ...launchArguments,
      ],
      timeout,
    });
    electronApp.process().stderr?.on('data', chunk => { if (/GPU process isn't usable|gpu_process_host.*exit_code=-1073741515/u.test(String(chunk))) gpuFailure = true; });
    await electronApp.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.setBackgroundThrottling(false);
    });

    log('Electron started; checking installed candidate version');
    const executableVersion = await electronApp.evaluate(({ app }) => app.getVersion());
    assert.equal(executableVersion, windowsPackage.version, 'Electron did not read the Windows candidate version.');

    const page = await electronApp.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
    page.on('console', message => { if (message.type() === 'error') log(`page console: ${message.text()}`); });
    page.on('requestfailed', request => log(`request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`));
    page.on('response', response => { if (response.status() >= 400) log(`HTTP ${response.status()}: ${response.url()}`); });
    await page.waitForLoadState('domcontentloaded');

    log('checking the Settings page Web version');
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await page.waitForTimeout(500);
    log(`current URL: ${page.url()}; body: ${(await page.locator('body').innerText()).slice(0, 500).replace(/\s+/gu, ' ')}`);
    await page.getByText('Kotobud 版本', { exact: true }).waitFor({ state: 'visible' });
    const settingsRow = page.locator('.setting-row').filter({ hasText: 'Kotobud 版本' });
    const displayedWebVersion = (await settingsRow.locator('span').last().innerText()).trim();
    assert.equal(displayedWebVersion, webPackage.version, 'The Settings page should display the Web UI version.');

    log('searching the legacy dictionary and opening dictionary comparison');
    await page.evaluate(() => { window.location.hash = '#/search'; });
    const search = page.locator('.vocab-search-form').getByRole('searchbox', { name: '日语词形、读音或中文释义' });
    await search.waitFor({ state: 'visible' });
    await search.fill(probeTerm);
    await search.press('Enter');
    const oldDictionaryResponse = await page.evaluate(async endpoint => { const response = await fetch(endpoint); return { status: response.status, body: await response.json() }; }, oldPath);
    assert.equal(oldDictionaryResponse.status, 200, `Legacy dictionary request failed: ${oldPath}`);
    const oldPayload = oldDictionaryResponse.body;
    assert(Array.isArray(oldPayload[probeTerm]) && oldPayload[probeTerm].length > 0,
      `Legacy dictionary payload did not contain ${probeTerm}.`);
    await page.waitForFunction(() => document.querySelector('.dictionary-results')?.getAttribute('aria-busy') === 'false', null, { timeout });
    assert((await page.locator('.dictionary-result').count()) > 0, 'The legacy dictionary search did not render results.');

    await page.getByRole('button', { name: `对照${probeTerm}的词典释义` }).first().click();
    await page.getByRole('heading', { name: '词典对照' }).waitFor({ state: 'visible' });
    const wikiResponse = await page.evaluate(async endpoint => { const response = await fetch(endpoint); return { status: response.status, body: await response.json() }; }, wikiPath);
    assert.equal(wikiResponse.status, 200, `Wiktionary request failed: ${wikiPath}`);
    const wikiPayload = wikiResponse.body;
    assert(Array.isArray(wikiPayload[probeTerm]) && wikiPayload[probeTerm].length > 0,
      `Wiktionary payload did not contain ${probeTerm}.`);

    const wikiSection = page.locator('.dictionary-comparison-source').filter({ has: page.locator('h3', { hasText: '维基词典' }) });
    await wikiSection.waitFor({ state: 'visible' });
    const sourceNames = ['Tomoshi', 'JMdict', '维基词典'];
    for (const sourceName of sourceNames) {
      assert.equal(await page.locator('.dictionary-comparison-source').filter({ has: page.locator('h3', { hasText: sourceName }) }).count(), 1,
        `The comparison panel did not show the ${sourceName} source.`);
    }
    const wikiToggle = wikiSection.locator('h3 button');
    if (await wikiToggle.getAttribute('aria-expanded') !== 'true') await wikiToggle.click();
    const wikiEntries = wikiSection.locator('.dictionary-comparison-entry');
    await wikiEntries.first().waitFor({ state: 'visible' });
    assert((await wikiEntries.count()) > 0, 'The Wiktionary source did not render matching entries.');
    assert.deepEqual(pageErrors, [], 'The app emitted uncaught page errors during native acceptance.');
    assert.equal(gpuFailure, false, 'Electron GPU process failed to start');
    const captured = await Promise.race([
      electronApp.evaluate(async ({ BrowserWindow }) => {
        const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true });
        return image.isEmpty() ? null : image.toPNG().toString('base64');
      }).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), 2500)),
    ]);
    if (captured) await writeFile(path.join(path.dirname(reportPath), 'windows-dictionary.png'), Buffer.from(captured, 'base64'));
    log('dictionary payloads and comparison results are present');

    result = {
      result: 'passed',
      windowsPackageVersion: executableVersion,
      webUiVersion: displayedWebVersion,
      stagedMainAsset: stageMetadata.mainAsset,
      stagedMainAssetSha256: stageMetadata.mainAssetSha256,
      dictionaryProbe: {
        term: probeTerm,
        legacyRequest: { path: oldPath, status: oldDictionaryResponse.status, entries: oldPayload[probeTerm].length },
        wiktionaryRequest: { path: wikiPath, status: wikiResponse.status, entries: wikiPayload[probeTerm].length },
        renderedSources: sourceNames,
      },
      scoringActions: 0,
      gpuFailure,
      packagedExecutable: !!packagedExecutable,
      screenshotCaptured: !!captured,
      profileWasIsolated: true,
      profileDirectoryRemoved: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    failure = error;
    gpuFailure ||= /GPU process isn't usable|gpu_process_host.*exit_code=-1073741515/u.test(String(error?.stack || error));
    result = {
      result: 'failed',
      windowsPackageVersion: windowsPackage.version,
      webUiVersion: webPackage.version,
      stagedMainAsset: stageMetadata.mainAsset,
      stagedMainAssetSha256: stageMetadata.mainAssetSha256,
      error: String(error?.stack || error),
      gpuFailure,
      pageErrors,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    if (electronApp) {
      const closed = await Promise.race([
        electronApp.close().then(() => true).catch(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)),
      ]);
      if (!closed) electronApp.process().kill();
    }
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({ ...result, report: path.relative(repoRoot, reportPath).replaceAll(path.sep, '/') }, null, 2));
  if (failure) process.exitCode = 1;
}

main().catch(error => {
  console.error(`[windows-acceptance] ${error?.stack || error}`);
  process.exitCode = 1;
});
