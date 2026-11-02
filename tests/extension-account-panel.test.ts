import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import { computed, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

function harness(authStatus: ReturnType<typeof vi.fn>) {
  const source = readFileSync('apps/extension/src/components/AccountPanel.vue', 'utf8');
  const script = compileScript(parse(source).descriptor, { id: 'account-panel-regression' }).content;
  const body = script.match(/setup\(__props, \{ expose: __expose, emit: __emit \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!body) throw new Error('AccountPanel setup is unavailable');
  const code = ts.transpileModule(body[1].replace(/__expose\(\);/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const events = new EventTarget();
  const documentEvents = new EventTarget();
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', Object.assign(documentEvents, { visibilityState: 'visible' }));
  vi.stubGlobal('BroadcastChannel', undefined);
  const mounted: Array<() => void> = [];
  const unmounted: Array<() => void> = [];
  const api = { authStatus, sync: vi.fn() };
  const setup = new Function('ref', 'computed', 'onMounted', 'onUnmounted', 'extensionApi', '__emit', code + '\nreturn { refreshStatus, status, busy };');
  const state = setup(ref, computed, (fn: () => void) => mounted.push(fn), (fn: () => void) => unmounted.push(fn), api, vi.fn());
  return { state, events, api, mounted, dispose: () => unmounted.forEach(fn => fn()) };
}

const accountStatus = (id: string, phase = 'ready', time = '2026-10-02T01:00:00.000Z') => ({
  user: { id, provider: 'kotobud' }, activePartitionKey: `account:${id}`,
  phase, ready: phase === 'ready', lastSyncedAt: time,
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('extension account panel background changes', () => {
  it('announces a restored identity so the learning page can reload the account snapshot', async () => {
    const test = harness(vi.fn().mockResolvedValue(accountStatus('a')));
    const changed = vi.fn();
    test.events.addEventListener('kotobud:account-changed', changed);
    await test.state.refreshStatus();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0].detail).toMatchObject({ partitionKey: 'account:a', refresh: true });
    await test.state.refreshStatus();
    expect(changed).toHaveBeenCalledTimes(1);
    test.dispose();
  });

  it('observes another window account change and removes listeners when unmounted', async () => {
    const status = vi.fn().mockResolvedValue(accountStatus('a'));
    const test = harness(status);
    test.mounted.forEach(fn => fn());
    await vi.waitFor(() => expect(test.state.status.value.user?.id).toBe('a'));
    status.mockResolvedValue(accountStatus('b'));
    test.events.dispatchEvent(new CustomEvent('kotobud:account-changed', { detail: { partitionKey: 'account:b' } }));
    await vi.waitFor(() => expect(test.state.status.value.user?.id).toBe('b'));
    test.dispose();
    const calls = status.mock.calls.length;
    test.events.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(status).toHaveBeenCalledTimes(calls);
  });

  it('discards a status response that arrives after unmount', async () => {
    let finish!: (value: unknown) => void;
    const test = harness(vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const changed = vi.fn();
    test.events.addEventListener('kotobud:account-changed', changed);
    const pending = test.state.refreshStatus();
    test.dispose();
    finish(accountStatus('a'));
    await pending;
    expect(test.state.status.value.user).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
});
