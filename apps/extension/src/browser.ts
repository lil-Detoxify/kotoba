import type { LookupRequest } from './model';

type Listener<T extends unknown[]> = { addListener(callback: (...args: T) => void): void; removeListener(callback: (...args: T) => void): void };
export interface ExtensionBrowser {
  runtime: {
    id?: string;
    getURL(path: string): string;
    lastError?: { message?: string };
    sendMessage(message: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }>;
    onInstalled: Listener<[]>;
    onMessage: { addListener(callback: (message: unknown, sender: { id?: string; url?: string }, respond: (response: unknown) => void) => boolean | void): void };
  };
  storage: {
    session: { get(key: string): Promise<Record<string, unknown>>; set(values: Record<string, unknown>): Promise<void> };
    onChanged: Listener<[Record<string, { newValue?: unknown; oldValue?: unknown }>, string]>;
  };
  contextMenus: {
    removeAll(callback: () => void): void;
    create(properties: { id: string; title: string; contexts: string[]; documentUrlPatterns: string[] }, callback: () => void): string | number;
    onClicked: Listener<[{ menuItemId: string | number; selectionText?: string; pageUrl?: string }, { windowId?: number; id?: number } | undefined]>;
  };
  sidePanel: { setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>; open(options: { windowId: number }): Promise<void> };
  tabs: { create(options: { url: string; windowId?: number }): Promise<unknown> };
  windows: { getCurrent(): Promise<{ id?: number }> };
}
export function getBrowser(): ExtensionBrowser | undefined {
  const browser = (globalThis as unknown as { chrome?: ExtensionBrowser }).chrome;
  return browser?.runtime?.id ? browser : undefined;
}
export function normalizeSelection(text: string | undefined): string {
  return (text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80);
}
export function sourceHostname(url: string | undefined): string | undefined {
  try { const value = new URL(url ?? ''); return ['https:', 'http:'].includes(value.protocol) ? value.hostname : undefined; } catch { return undefined; }
}
export function isLookupRequest(value: unknown): value is LookupRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<LookupRequest>;
  return typeof request.text === 'string' && request.text.length > 0 && request.text.length <= 80 && typeof request.requestId === 'string';
}
