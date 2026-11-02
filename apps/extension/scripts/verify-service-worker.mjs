import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

// Execute the actual Vite bundle outside Vitest's module transformer and without
// DOM globals, as an MV3 service worker does. Every database is synthetic.
if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url));
  const timeout = setTimeout(() => {
    void worker.terminate();
  }, 10_000);
  try {
    const report = await new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', code => {
        if (code !== 0) reject(new Error(`Service worker verification exited ${code}`));
      });
    });
    console.log(JSON.stringify(report));
  } finally {
    clearTimeout(timeout);
    await worker.terminate();
  }
} else {
  await import('fake-indexeddb/auto');
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
  const listeners = [];
  const extensionId = 'kotobud-worker-verification';
  const origin = `chrome-extension://${extensionId}/`;
  const event = { addListener() {}, removeListener() {} };
  globalThis.chrome = {
    runtime: {
      id: extensionId, getURL: path => origin + path,
      onInstalled: event,
      onMessage: { addListener: listener => listeners.push(listener) },
    },
    contextMenus: { onClicked: event },
  };
  globalThis.fetch = async resource => {
    assert.equal(String(resource), origin + 'data/catalog.json', 'Only packaged textbook reads are allowed; no real account requests');
    return new Response(await readFile(new URL('../dist/data/catalog.json', import.meta.url)), {
      headers: { 'content-type': 'application/json' },
    });
  };
  await import('../dist/background.js');
  assert.equal(listeners.length, 1);
  const command = (method, args = [], expectedPartitionKey) => new Promise((resolve, reject) => {
    const keepAlive = listeners[0](
      { type: 'kotobud:command', method, args, expectedPartitionKey },
      { id: extensionId, url: origin + 'sidepanel.html' },
      response => {
        if (!response.ok) reject(new Error(`${method}: ${response.error}`));
        else resolve(response.data);
      },
    );
    assert.equal(keepAlive, true);
  });
  const snapshot = await command('read');
  assert.equal(snapshot.schema, 1);
  assert.equal(snapshot.identity.partitionKey, 'current');
  const status = await command('authStatus');
  assert.equal(status.user, null);
  assert.equal(status.activePartitionKey, 'current');
  const changed = await command('setDailyGoal', [12], 'current');
  assert.equal(changed.preferences.dailyGoal, 12);
  const restored = await command('read');
  assert.equal(restored.preferences.dailyGoal, 12);
  const catalog = JSON.parse(await readFile(new URL('../dist/data/catalog.json', import.meta.url), 'utf8'));
  const word = catalog[0];
  const saved = await command('save', [word], 'current');
  assert.equal(saved.words[0].word.id, word.id);
  const reviewed = await command('rate', [word.id, 3, 'worker-verification-rating', 0], 'current');
  assert.equal(reviewed.words[0].state.reviewCount, 1);
  const reloaded = await command('read');
  assert.equal(reloaded.words[0].state.reviewCount, 1);
  parentPort.postMessage({ serviceWorker: 'passed', domGlobals: false, commands: ['read', 'authStatus', 'setDailyGoal', 'read', 'save', 'rate', 'read'] });
}
