import { getBrowser, isLookupRequest } from './browser';
import type { ExtensionApi, ExtensionSnapshot } from './model';

const browser = getBrowser();
let expectedPartitionKey: string | undefined;
let latestReadRequest = 0;
let contextGeneration = 0;
async function command<T = ExtensionSnapshot>(method: string, args: unknown[] = []): Promise<T> {
  const accountAction = ['authStatus', 'checkAccount', 'sendCode', 'login', 'register', 'logout', 'sync'].includes(method);
  if (method !== 'read' && !accountAction && !expectedPartitionKey) throw new Error('请先读取扩展数据，再执行此操作。');
  const expectedAtStart = expectedPartitionKey;
  const generationAtStart = contextGeneration;
  const readRequest = method === 'read' ? ++latestReadRequest : undefined;
  let data: unknown;
  if (browser) {
    // Chromium serializes undefined array entries as null. Omit absent optional
    // trailing parameters so the receiver keeps its normal undefined defaults.
    const messageArgs = [...args];
    while (messageArgs.length && messageArgs[messageArgs.length - 1] === undefined) messageArgs.pop();
    const response = await browser.runtime.sendMessage({
      type: 'kotobud:command',
      method,
      args: messageArgs,
      ...(method === 'read' ? {} : { expectedPartitionKey })
    });
    if (!response?.ok) throw new Error(response?.error || '本地操作未完成，请重试。');
    data = response.data;
  } else {
    const runtime = await import('./runtime');
    data = await runtime.command(method, args, method === 'read' ? undefined : expectedPartitionKey);
  }
  if (method === 'read' && data && typeof data === 'object') {
    if (readRequest !== latestReadRequest || generationAtStart !== contextGeneration) throw new Error('账号已切换，请重新读取扩展数据。');
    const identity = (data as ExtensionSnapshot).identity;
    if (identity && typeof identity.partitionKey === 'string') expectedPartitionKey = identity.partitionKey;
  } else if (data && typeof data === 'object' && 'identity' in data) {
    const identity = (data as ExtensionSnapshot).identity;
    // A write response may refresh an existing context but must never establish
    // or replace one. In-flight responses from before an account transition
    // are ignored even if they arrive after the new account has been read.
    if (generationAtStart === contextGeneration && expectedAtStart &&
        expectedPartitionKey === expectedAtStart && identity?.partitionKey === expectedAtStart) {
      expectedPartitionKey = identity.partitionKey;
    }
  }
  return data as T;
}
async function refreshAccountContext(): Promise<void> {
  contextGeneration++;
  expectedPartitionKey = undefined;
  await command('authStatus');
  await command('read');
}
async function accountTransition<T>(method: 'login' | 'register' | 'logout', args: unknown[]): Promise<T> {
  contextGeneration++;
  expectedPartitionKey = undefined;
  latestReadRequest++;
  try {
    return await command<T>(method, args);
  } finally {
    await refreshAccountContext();
  }
}
export const extensionApi: ExtensionApi = {
  authStatus: () => command('authStatus'),
  checkAccount: email => command('checkAccount', [email]),
  sendCode: email => command('sendCode', [email]),
  login: (email, password) => accountTransition('login', [email, password]),
  register: (email, password, code, verificationId, flow) => accountTransition('register', [email, password, code, verificationId, flow]),
  logout: () => accountTransition('logout', []),
  sync: options => command('sync', [{ expectedPartitionKey: expectedPartitionKey ?? '', ...options }]),
  async loadCatalog() {
    const path = browser ? browser.runtime.getURL('data/catalog.json') : '/data/catalog.json';
    const response = await fetch(path);
    if (!response.ok) throw new Error('词库暂时无法读取，请重试。');
    const catalog: unknown = await response.json();
    if (!Array.isArray(catalog) || !catalog.every(word => word && typeof word.id === 'string' && typeof word.term === 'string' && typeof word.reading === 'string' && typeof word.meaning === 'string' && typeof word.order === 'number' && word.source === 'textbook')) throw new Error('词库格式不正确，请重新加载扩展。');
    return catalog;
  },
  read: () => command('read'),
  save: (word, host) => command('save', [word, host]),
  remove: wordId => command('remove', [wordId]),
  rate: (wordId, grade, requestId, count) => command('rate', [wordId, grade, requestId, count]),
  setMotion: mode => command('setMotion', [mode]),
  getLearningQueue: (words, options) => command('getLearningQueue', [words, options]),
  rateLearning: (word, rating, requestId, expectedReviewCount, mode, elapsedMs, quizRequestId, sceneId, feedbackPractice, personalContextId) => command('rateLearning', [word, rating, requestId, expectedReviewCount, mode, elapsedMs, quizRequestId, sceneId, feedbackPractice, personalContextId]),
  setLearningFlags: (wordId, patch, word) => command('setLearningFlags', [wordId, patch, word]),
  recordQuizAttempt: attempt => command('recordQuizAttempt', [attempt]),
  importCustomBook: input => command('importCustomBook', [input]),
  mutatePersonalLibrary: action => command('mutatePersonalLibrary', [action]),
  readPersonalBackup: () => command('readPersonalBackup'),
  savePersonalBackup: () => command('savePersonalBackup'),
  mergePersonalBackup: policy => command('mergePersonalBackup', [policy]),
  setDailyGoal: goal => command('setDailyGoal', [goal]),
  setVoice: voice => command('setVoice', [voice]),
  setExerciseType: type => command('setExerciseType', [type]),
  setSelectedBookIds: ids => command('setSelectedBookIds', [ids]),
  subscribeLookup(handler) {
    if (!browser) return () => {};
    let disposed = false;
    let key: string | undefined;
    let latestId = '';
    const receive = (request: unknown) => {
      if (!disposed && isLookupRequest(request) && request.requestId !== latestId) { latestId = request.requestId; handler(request); }
    };
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && key && changes[key]) receive(changes[key].newValue);
    };
    browser.storage.onChanged.addListener(listener);
    void browser.windows.getCurrent().then(async window => {
      if (disposed) return;
      key = `lookup:${window.id}`;
      const saved = await browser.storage.session.get(key);
      // A change event may have delivered a newer selection while get() was pending.
      if (!latestId) receive(saved[key]);
    }).catch(() => { /* Manual lookup stays usable if the browser cannot supply a window. */ });
    return () => { disposed = true; browser.storage.onChanged.removeListener(listener); };
  },
};
