import { afterEach, describe, expect, it, vi } from 'vitest';

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

function createHarness() {
  const extensionId = 'extension-test-id';
  const installed = createEvent<[]>();
  const clicked = createEvent<[{
    menuItemId: string | number;
    selectionText?: string;
    pageUrl?: string;
  }, { windowId?: number; id?: number } | undefined]>();
  const messages = createEvent<[unknown, { id?: string; url?: string }, (response: unknown) => void]>();
  const repository = {
    read: vi.fn(async () => ({ marker: 'snapshot' })),
    save: vi.fn(async (..._args: unknown[]) => ({ marker: 'saved' })),
    remove: vi.fn(async (..._args: unknown[]) => ({ marker: 'removed' })),
    rate: vi.fn(async (..._args: unknown[]) => ({ marker: 'rated' })),
    setMotion: vi.fn(async (..._args: unknown[]) => ({ marker: 'motion' }))
  };
  const browser = {
    runtime: {
      id: extensionId,
      getURL: (path: string) => 'chrome-extension://' + extensionId + '/' + path,
      lastError: undefined as { message?: string } | undefined,
      sendMessage: vi.fn(async () => ({ ok: true })),
      onInstalled: installed,
      onMessage: messages
    },
    storage: {
      session: {
        get: vi.fn(async (_key: string) => ({} as Record<string, unknown>)),
        set: vi.fn(async (_values: Record<string, unknown>): Promise<void> => undefined)
      },
      onChanged: createEvent<[Record<string, { newValue?: unknown; oldValue?: unknown }>, string]>()
    },
    contextMenus: {
      removeAll: vi.fn((callback: () => void) => callback()),
      create: vi.fn((_properties: unknown, callback: () => void) => {
        callback();
        return 'menu';
      }),
      onClicked: clicked
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async (_options: { openPanelOnActionClick: boolean }) => undefined),
      open: vi.fn(async (_options: { windowId: number }) => undefined)
    },
    tabs: {
      create: vi.fn(async (_options: { url: string; windowId?: number }) => undefined)
    },
    windows: {
      getCurrent: vi.fn(async () => ({ id: 17 }))
    }
  };

  return { browser, events: { installed, clicked, messages }, repository, extensionId };
}

async function loadBackground(harness: ReturnType<typeof createHarness>) {
  vi.resetModules();
  vi.doMock('../apps/extension/src/browser', async () => {
    const actual = await vi.importActual<typeof import('../apps/extension/src/browser')>('../apps/extension/src/browser');
    return { ...actual, getBrowser: () => harness.browser };
  });
  vi.doMock('../apps/extension/src/runtime', () => ({
    command: async (method: string, args: unknown[] = []) => {
      const operation = (harness.repository as unknown as Record<string, unknown>)[method];
      if (typeof operation !== 'function') throw new Error('不支持的扩展操作。');
      return (operation as (...values: unknown[]) => Promise<unknown>)(...args);
    }
  }));
  await import('../apps/extension/src/background');
}

afterEach(() => {
  vi.doUnmock('../apps/extension/src/browser');
  vi.doUnmock('../apps/extension/src/runtime');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('extension background events', () => {
  it('configures the selection menu and action side panel after installation', async () => {
    const harness = createHarness();
    await loadBackground(harness);

    expect(harness.events.installed.listeners).toHaveLength(1);
    harness.events.installed.dispatch();

    expect(harness.browser.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
    expect(harness.browser.contextMenus.removeAll).toHaveBeenCalledTimes(1);
    expect(harness.browser.contextMenus.create).toHaveBeenCalledWith({
      id: 'kotobud-lookup',
      title: '用 KotoBud 查词「%s」',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    }, expect.any(Function));
  });

  it('ignores messages outside the trusted extension id and exact URL origin boundary', async () => {
    const harness = createHarness();
    await loadBackground(harness);
    const listener = harness.events.messages.listeners[0];
    const command = { type: 'kotobud:command', method: 'read' };
    const untrustedSenders = [
      { id: 'another-extension', url: 'chrome-extension://' + harness.extensionId + '/sidepanel.html' },
      { id: harness.extensionId, url: 'https://example.test/sidepanel.html' },
      { id: harness.extensionId, url: 'chrome-extension://' + harness.extensionId + '.attacker/sidepanel.html' },
      { id: harness.extensionId, url: 'chrome-extension://' + harness.extensionId }
    ];

    for (const sender of untrustedSenders) {
      const respond = vi.fn();
      expect(listener(command, sender, respond)).toBeUndefined();
      expect(respond).not.toHaveBeenCalled();
    }
    expect(harness.repository.read).not.toHaveBeenCalled();
  });

  it('returns true for asynchronous replies and responds with repository data', async () => {
    const harness = createHarness();
    await loadBackground(harness);
    const pending = deferred<{ marker: string }>();
    harness.repository.read.mockImplementation(() => pending.promise);
    const respond = vi.fn();

    const keepChannelOpen = harness.events.messages.listeners[0](
      { type: 'kotobud:command', method: 'read' },
      { id: harness.extensionId, url: 'chrome-extension://' + harness.extensionId + '/sidepanel.html' },
      respond
    );

    expect(keepChannelOpen).toBe(true);
    expect(respond).not.toHaveBeenCalled();
    pending.resolve({ marker: 'loaded' });
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, data: { marker: 'loaded' } }));
  });

  it('turns unknown methods into a failed response instead of leaving the request unresolved', async () => {
    const harness = createHarness();
    await loadBackground(harness);
    const respond = vi.fn();

    const keepChannelOpen = harness.events.messages.listeners[0](
      { type: 'kotobud:command', method: 'not-a-command' },
      { id: harness.extensionId, url: 'chrome-extension://' + harness.extensionId + '/sidepanel.html' },
      respond
    );

    expect(keepChannelOpen).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false, error: '不支持的扩展操作。' }));
    expect(harness.repository.read).not.toHaveBeenCalled();
  });

  it('opens the side panel during the click gesture, before saving only bounded text and its hostname', async () => {
    const harness = createHarness();
    await loadBackground(harness);
    const calls: string[] = [];
    let gestureActive = true;
    harness.browser.sidePanel.open.mockImplementation(async (_options: { windowId: number }) => {
      expect(gestureActive).toBe(true);
      calls.push('open');
    });
    harness.browser.storage.session.set.mockImplementation(async (_values: Record<string, unknown>) => {
      calls.push('save');
    });

    harness.events.clicked.dispatch({
      menuItemId: 'kotobud-lookup',
      selectionText: '  Ａ　Ｂ  ' + '日'.repeat(100),
      pageUrl: 'https://reader:secret@News.Example.test/article?token=private#part'
    }, { windowId: 23, id: 101 });
    gestureActive = false;

    expect(calls).toEqual(['open', 'save']);
    const [payload] = harness.browser.storage.session.set.mock.calls[0];
    const key = 'lookup:23';
    expect(Object.keys(payload as object)).toEqual([key]);
    const savedRequest = (payload as Record<string, { text: string; sourceHost?: string; requestId: string }>)[key];
    expect(savedRequest).toEqual({
      text: 'A B ' + '日'.repeat(76),
      sourceHost: 'news.example.test',
      requestId: expect.any(String)
    });
    expect(savedRequest.text).toHaveLength(80);
    expect(JSON.stringify(savedRequest)).not.toContain('private');
    expect(harness.browser.sidePanel.open).toHaveBeenCalledWith({ windowId: 23 });
  });

  it('does nothing when the menu, selection, or clicked window is invalid', async () => {
    const harness = createHarness();
    await loadBackground(harness);

    harness.events.clicked.dispatch({ menuItemId: 'other-menu', selectionText: '日本語' }, { windowId: 1 });
    harness.events.clicked.dispatch({ menuItemId: 'kotobud-lookup', selectionText: '日本語' }, undefined);
    harness.events.clicked.dispatch({ menuItemId: 'kotobud-lookup', selectionText: ' \t\n ' }, { windowId: 1 });
    harness.events.clicked.dispatch({ menuItemId: 'kotobud-lookup', selectionText: '日本語' }, { windowId: undefined });

    expect(harness.browser.sidePanel.open).not.toHaveBeenCalled();
    expect(harness.browser.storage.session.set).not.toHaveBeenCalled();
    expect(harness.browser.tabs.create).not.toHaveBeenCalled();
  });

  it('waits for the selected request to save, then opens the fallback page in the clicked window', async () => {
    const harness = createHarness();
    await loadBackground(harness);
    const storagePending = deferred<void>();
    harness.browser.storage.session.set.mockImplementation(async (_values: Record<string, unknown>) => storagePending.promise);
    harness.browser.sidePanel.open.mockRejectedValue(new Error('panel unavailable'));

    harness.events.clicked.dispatch({
      menuItemId: 'kotobud-lookup',
      selectionText: '日本語',
      pageUrl: 'https://news.example.test/article?secret=private'
    }, { windowId: 35, id: 501 });

    expect(harness.browser.sidePanel.open).toHaveBeenCalledWith({ windowId: 35 });
    expect(harness.browser.storage.session.set).toHaveBeenCalledWith({
      'lookup:35': {
        text: '日本語',
        sourceHost: 'news.example.test',
        requestId: expect.any(String)
      }
    });
    await Promise.resolve();
    expect(harness.browser.tabs.create).not.toHaveBeenCalled();

    storagePending.resolve();
    await vi.waitFor(() => expect(harness.browser.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://' + harness.extensionId + '/sidepanel.html',
      windowId: 35
    }));
  });

  it('does not open an empty fallback page when saving the selection fails', async () => {
    const harness = createHarness();
    await loadBackground(harness);
    const error = new Error('session storage unavailable');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.browser.storage.session.set.mockRejectedValue(error);
    harness.browser.sidePanel.open.mockRejectedValue(new Error('panel unavailable'));

    harness.events.clicked.dispatch({
      menuItemId: 'kotobud-lookup',
      selectionText: '日本語'
    }, { windowId: 35 });

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('KotoBud lookup could not be opened', error));
    expect(harness.browser.tabs.create).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('KotoBud selected word could not be saved', error);
  });
});
