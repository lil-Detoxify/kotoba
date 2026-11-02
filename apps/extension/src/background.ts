import { getBrowser, normalizeSelection, sourceHostname } from './browser';
import { command } from './runtime';

const browser = getBrowser();
const MENU_ID = 'kotobud-lookup';
if (browser) {
  const configure = () => {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error('KotoBud side panel unavailable', error));
    browser.contextMenus.removeAll(() => {
      if (browser.runtime.lastError) return;
      browser.contextMenus.create({ id: MENU_ID, title: '用 KotoBud 查词「%s」', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] }, () => {
        if (browser.runtime.lastError) console.error('KotoBud context menu unavailable', browser.runtime.lastError.message);
      });
    });
  };
  browser.runtime.onInstalled.addListener(configure);
  // Register top-level listeners on every service worker wake. No persistent timer.
  browser.contextMenus.onClicked.addListener((info, tab) => {
    const text = normalizeSelection(info.selectionText);
    if (info.menuItemId !== MENU_ID || !text || tab?.windowId === undefined) return;
    // Invoke before any await, while the context-menu user gesture is active.
    const opening = browser.sidePanel.open({ windowId: tab.windowId });
    const saving = browser.storage.session.set({ [`lookup:${tab.windowId}`]: { text, sourceHost: sourceHostname(info.pageUrl), requestId: crypto.randomUUID() } });
    void saving.catch(error => console.error('KotoBud selected word could not be saved', error));
    void opening.catch(async () => { await saving; await browser.tabs.create({ url: browser.runtime.getURL('sidepanel.html'), windowId: tab.windowId }); }).catch(error => console.error('KotoBud lookup could not be opened', error));
  });
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL(''))) return;
    if (!message || typeof message !== 'object') return;
    const request = message as { type?: string; method?: string; args?: unknown[]; expectedPartitionKey?: string };
    if (request.type !== 'kotobud:command') return;
    const args = Array.isArray(request.args) ? request.args : [];
    const run = async () => {
      if (!request.method) throw new Error('未识别的操作。');
      // MV3 service workers support static imports, not import() or DOM preload helpers.
      return command(request.method, args, request.expectedPartitionKey);
    };
    void run().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : '本地操作未完成。' }));
    return true;
  });
}
