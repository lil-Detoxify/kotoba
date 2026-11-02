import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionBrowser } from '../apps/extension/src/browser';
import { getBrowser, isLookupRequest, normalizeSelection, sourceHostname } from '../apps/extension/src/browser';

type EventCallback<Args extends unknown[]> = (...args: Args) => unknown;

function createEvent<Args extends unknown[]>() {
  const listeners: EventCallback<Args>[] = [];
  return {
    listeners,
    addListener(callback: EventCallback<Args>) {
      listeners.push(callback);
    },
    removeListener(callback: EventCallback<Args>) {
      const index = listeners.indexOf(callback);
      if (index >= 0) listeners.splice(index, 1);
    },
    dispatch(...args: Args) {
      for (const callback of [...listeners]) callback(...args);
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createBrowserHarness() {
  const ID = 'extension-test-id';
  const storageChanged = createEvent<[Record<string, { newValue?: unknown; oldValue?: unknown }>, string]>();
  const onInstalled = createEvent<[]>();
  const onClicked = createEvent<[{
    menuItemId: string | number;
    selectionText?: string;
    pageUrl?: string;
  }, { windowId?: number; id?: number } | undefined]>();
  const onMessage = createEvent<[unknown, { id?: string; url?: string }, (response: unknown) => void]>();

  const browser = {
    runtime: {
      id: ID,
      getURL: (path: string) => 'chrome-extension://' + ID + '/' + path,
      lastError: undefined as { message?: string } | undefined,
      sendMessage: vi.fn(async () => ({ ok: true })),
      onInstalled,
      onMessage
    },
    storage: {
      session: {
        get: vi.fn(async () => ({} as Record<string, unknown>)),
        set: vi.fn(async () => undefined)
      },
      onChanged: storageChanged
    },
    contextMenus: {
      removeAll: vi.fn((callback: () => void) => callback()),
      create: vi.fn((_properties: unknown, callback: () => void) => {
        callback();
        return 'menu';
      }),
      onClicked
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
      open: vi.fn(async () => undefined)
    },
    tabs: {
      create: vi.fn(async (_options: { url: string; windowId?: number }) => undefined)
    },
    windows: {
      getCurrent: vi.fn(async () => ({ id: 17 }))
    }
  } as unknown as ExtensionBrowser & {
    storage: {
      session: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
      };
      onChanged: typeof storageChanged;
    };
    windows: { getCurrent: ReturnType<typeof vi.fn> };
  };

  return { browser, storageChanged, ID };
}

const originalChrome = (globalThis as typeof globalThis & { chrome?: ExtensionBrowser }).chrome;

afterEach(() => {
  const global = globalThis as typeof globalThis & { chrome?: ExtensionBrowser };
  if (originalChrome === undefined) delete global.chrome;
  else global.chrome = originalChrome;

  vi.doUnmock('../apps/extension/src/browser');
  vi.doUnmock('../apps/extension/src/repository');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('extension browser boundaries', () => {
  it('only exposes a browser runtime with an extension id', () => {
    const global = globalThis as typeof globalThis & { chrome?: ExtensionBrowser };
    global.chrome = { runtime: {} } as unknown as ExtensionBrowser;
    expect(getBrowser()).toBeUndefined();

    const available = { runtime: { id: 'extension-test-id' } } as unknown as ExtensionBrowser;
    global.chrome = available;
    expect(getBrowser()).toBe(available);
  });

  it('normalizes selected text to the bounded form and retains only an HTTP hostname', () => {
    const text = normalizeSelection('  Ａ　Ｂ  ' + '日'.repeat(100));
    expect(text).toBe('A B ' + '日'.repeat(76));
    expect(text).toHaveLength(80);
    expect(sourceHostname('https://reader:secret@News.Example.test:443/article?token=private#part')).toBe('news.example.test');
    expect(sourceHostname('file:///private/document')).toBeUndefined();
  });

  it('accepts only non-empty bounded lookup payloads with request ids', () => {
    expect(isLookupRequest({ text: '日本', sourceHost: 'example.test', requestId: 'r-1' })).toBe(true);
    expect(isLookupRequest({ text: '', requestId: 'r-2' })).toBe(false);
    expect(isLookupRequest({ text: '日'.repeat(81), requestId: 'r-3' })).toBe(false);
    expect(isLookupRequest({ text: '日本' })).toBe(false);
  });

  it('scopes lookup reads to the current window and keeps a newer event over a pending stale read', async () => {
    const harness = createBrowserHarness();
    const currentWindow = deferred<{ id?: number }>();
    const pendingRead = deferred<Record<string, unknown>>();
    harness.browser.windows.getCurrent = vi.fn(() => currentWindow.promise);
    harness.browser.storage.session.get = vi.fn(() => pendingRead.promise);

    vi.resetModules();
    vi.doMock('../apps/extension/src/browser', async () => {
      const actual = await vi.importActual<typeof import('../apps/extension/src/browser')>('../apps/extension/src/browser');
      return { ...actual, getBrowser: () => harness.browser };
    });
    vi.doMock('../apps/extension/src/repository', () => ({
      ExtensionRepository: class {
        read = vi.fn(async () => ({}));
        save = vi.fn(async () => ({}));
        remove = vi.fn(async () => ({}));
        rate = vi.fn(async () => ({}));
        setMotion = vi.fn(async () => ({}));
      }
    }));

    const { extensionApi } = await import('../apps/extension/src/client');
    const received = vi.fn();
    const unsubscribe = extensionApi.subscribeLookup(received);
    currentWindow.resolve({ id: 42 });

    await vi.waitFor(() => expect(harness.browser.storage.session.get).toHaveBeenCalledWith('lookup:42'));

    const stale = { text: '古い選択', sourceHost: 'old.example', requestId: 'old' };
    const latest = { text: '新しい選択', sourceHost: 'new.example', requestId: 'new' };
    harness.storageChanged.dispatch({ 'lookup:41': { newValue: stale } }, 'session');
    harness.storageChanged.dispatch({ 'lookup:42': { newValue: stale } }, 'local');
    harness.storageChanged.dispatch({ 'lookup:42': { newValue: latest } }, 'session');

    pendingRead.resolve({ 'lookup:42': stale });
    await Promise.resolve();

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(latest);

    unsubscribe();
    harness.storageChanged.dispatch({ 'lookup:42': { newValue: { ...latest, requestId: 'after-unsubscribe' } } }, 'session');
    expect(received).toHaveBeenCalledTimes(1);
    expect(harness.storageChanged.listeners).toHaveLength(0);
  });
});
