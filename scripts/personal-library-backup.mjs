// Account backups contain personal content only; learning state stays in the existing sync API.
// D1 allows a 2,000,000-byte string/row. Leave room for the row metadata.
// https://developers.cloudflare.com/d1/platform/limits/
const personalLibraryBackupMaxBytes = 1024 * 1024;
const personalLibraryBackupWordTextFields = [
  'partOfSpeech', 'accent', 'example', 'exampleTranslation', 'audioUrl', 'audioTerm',
  'rawTerm', 'note', 'definitionJa', 'definitionZh', 'exampleReading',
];
const personalLibraryBackupSenseTextFields = ['definitionJa', 'partOfSpeech', 'example', 'exampleReading', 'exampleTranslation'];

function personalLibraryBackupRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正确。`);
  return value;
}

function personalLibraryBackupText(value, label, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${label}缺少有效文本。`);
  return value;
}

function personalLibraryBackupDate(value, label) {
  const text = personalLibraryBackupText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label}不是有效日期。`);
  return text;
}

function personalLibraryBackupArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}应为列表。`);
  return value;
}

function personalLibraryBackupOrder(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label}不是有效顺序。`);
  return value;
}

function personalLibraryBackupOptionalTexts(source, fields, label) {
  const result = {};
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = personalLibraryBackupText(source[field], `${label}的 ${field}`, true);
  }
  return result;
}

function personalLibraryBackupUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label}中出现了重复 ID。`);
    ids.add(item.id);
  }
  return ids;
}

function personalLibraryBackupContexts(value) {
  const contexts = personalLibraryBackupArray(value, '收藏原句').map(value => {
    const context = personalLibraryBackupRecord(value, '收藏原句');
    const result = {
      id: personalLibraryBackupText(context.id, '原句 ID'),
      sentence: personalLibraryBackupText(context.sentence, '原句'),
      createdAt: personalLibraryBackupDate(context.createdAt, '原句创建时间'),
      updatedAt: personalLibraryBackupDate(context.updatedAt, '原句修改时间'),
      ...personalLibraryBackupOptionalTexts(context, ['translation', 'sourceTitle', 'sourceUrl', 'matchedText'], '原句'),
    };
    // Match the file-import contract without retaining any unrelated properties.
    for (const [field, maximum] of [['sentence', 2000], ['translation', 2000], ['sourceTitle', 200], ['sourceUrl', 2048], ['matchedText', 200]]) {
      if (result[field] !== undefined && result[field].trim().replace(/\r\n?/gu, '\n').length > maximum) {
        throw new Error(`原句的 ${field}最多 ${maximum} 个字符。`);
      }
    }
    if (result.sourceUrl?.trim()) {
      let url;
      try { url = new URL(result.sourceUrl); } catch { throw new Error('来源网址请填写完整的 http 或 https 地址。'); }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('来源网址请填写完整的 http 或 https 地址。');
    }
    return result;
  });
  personalLibraryBackupUniqueIds(contexts, '收藏原句');
  return contexts;
}

function personalLibraryBackupContent(value) {
  const source = personalLibraryBackupRecord(value, '词库备份');
  if (source.kind !== 'kotobud-personal-library' || source.version !== 1) throw new Error('请选择当前版本的 KotoBud 个人词库包。');
  const books = personalLibraryBackupArray(source.books, '词书').map(value => {
    const book = personalLibraryBackupRecord(value, '词书');
    return {
      id: personalLibraryBackupText(book.id, '词书 ID'),
      title: personalLibraryBackupText(book.title, '词书名称'),
      description: personalLibraryBackupText(book.description, '词书简介', true),
      language: personalLibraryBackupText(book.language, '词书语言'),
      createdAt: personalLibraryBackupDate(book.createdAt, '词书创建时间'),
      updatedAt: personalLibraryBackupDate(book.updatedAt, '词书修改时间'),
      ...personalLibraryBackupOptionalTexts(book, ['cover'], '词书'),
    };
  });
  const lessons = personalLibraryBackupArray(source.lessons, '课次').map(value => {
    const lesson = personalLibraryBackupRecord(value, '课次');
    return {
      id: personalLibraryBackupText(lesson.id, '课次 ID'),
      bookId: personalLibraryBackupText(lesson.bookId, '课次所属词书'),
      title: personalLibraryBackupText(lesson.title, '课次名称'),
      order: personalLibraryBackupOrder(lesson.order, '课次顺序'),
    };
  });
  const words = personalLibraryBackupArray(source.words, '词条').map(value => {
    const word = personalLibraryBackupRecord(value, '词条');
    const result = {
      id: personalLibraryBackupText(word.id, '词条 ID'),
      lessonId: personalLibraryBackupText(word.lessonId, '词条所属课次'),
      term: personalLibraryBackupText(word.term, '词形'),
      reading: personalLibraryBackupText(word.reading, '读音', true),
      meaning: personalLibraryBackupText(word.meaning, '释义', true),
      order: personalLibraryBackupOrder(word.order, '词条顺序'),
      ...personalLibraryBackupOptionalTexts(word, personalLibraryBackupWordTextFields, '词条'),
    };
    if (word.senses !== undefined) result.senses = personalLibraryBackupArray(word.senses, '义项').map(value => {
      const sense = personalLibraryBackupRecord(value, '义项');
      return { meaning: personalLibraryBackupText(sense.meaning, '义项释义', true), ...personalLibraryBackupOptionalTexts(sense, personalLibraryBackupSenseTextFields, '义项') };
    });
    if (word.readingContexts !== undefined) result.readingContexts = personalLibraryBackupContexts(word.readingContexts);
    return result;
  });
  const builtinContexts = personalLibraryBackupArray(source.builtinContexts, '内置词条原句').map(value => {
    const entry = personalLibraryBackupRecord(value, '内置词条原句');
    return {
      bookId: personalLibraryBackupText(entry.bookId, '原句所属词书'),
      wordId: personalLibraryBackupText(entry.wordId, '原句所属词条'),
      contexts: personalLibraryBackupContexts(entry.contexts),
    };
  });
  const bookIds = personalLibraryBackupUniqueIds(books, '词书');
  const lessonIds = personalLibraryBackupUniqueIds(lessons, '课次');
  const wordIds = personalLibraryBackupUniqueIds(words, '词条');
  personalLibraryBackupUniqueIds(builtinContexts.map(entry => ({ id: entry.wordId })), '内置词条原句');
  for (const lesson of lessons) if (!bookIds.has(lesson.bookId)) throw new Error('课次所属词书不在备份内，请重新导出。');
  for (const word of words) if (!lessonIds.has(word.lessonId)) throw new Error('词条所属课次不在备份内，请重新导出。');
  for (const entry of builtinContexts) {
    if (bookIds.has(entry.bookId) || wordIds.has(entry.wordId)) throw new Error('备份的原句关联重复，请重新导出。');
  }
  return {
    kind: 'kotobud-personal-library', version: 1,
    exportedAt: personalLibraryBackupDate(source.exportedAt, '导出时间'),
    books, lessons, words, builtinContexts,
  };
}

async function personalLibraryBackupReadBody(request) {
  // The small envelope allowance is outside the 1 MiB limit on content JSON.
  const maximum = personalLibraryBackupMaxBytes + 4096;
  const contentLength = Number(request.headers.get('content-length'));
  if (contentLength > maximum) throw new RangeError('backup_too_large');
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new RangeError('backup_too_large');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  return JSON.parse(text);
}

async function personalLibraryBackupReadRow(db, userId) {
  return db.prepare('SELECT revision, payload_json, updated_at FROM personal_library_backups WHERE user_id = ?').bind(userId).first();
}

function personalLibraryBackupMetadata(row) {
  if (!row) return null;
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid backup revision');
  return { revision, updatedAt: personalLibraryBackupDate(row.updated_at, '备份时间') };
}

/** Append this module to the approved Worker and pass its existing auth/json helpers. */
export async function handlePersonalLibraryBackup(request, env, { verifyAuthToken, getOrCreateUser, json }) {
  if (request.method !== 'GET' && request.method !== 'PUT') return json({ error: 'method_not_allowed' }, 405);
  const unavailable = () => json({ error: 'backup_unavailable', message: '账号词库备份暂不可用，请稍后重试，或使用文件迁移。' }, 503);
  const tooLarge = () => json({ error: 'backup_too_large', maxBytes: personalLibraryBackupMaxBytes, message: '个人词库超过 1 MiB，请使用文件迁移。' }, 413);
  let authIdentity;
  try { authIdentity = await verifyAuthToken(request, env); } catch { return unavailable(); }
  if (!authIdentity) return json({ error: 'unauthorized', message: '请先登录后使用账号词库备份。' }, 401);
  if (!env.DB) return unavailable();
  let user;
  try { user = await getOrCreateUser(env.DB, authIdentity); } catch { return unavailable(); }
  if (!user || typeof user.id !== 'string' || !user.id.trim()) return unavailable();
  if (request.method === 'GET') {
    try {
      const row = await personalLibraryBackupReadRow(env.DB, user.id);
      return json({ backup: row ? { ...personalLibraryBackupMetadata(row), library: personalLibraryBackupContent(JSON.parse(row.payload_json)) } : null }, 200);
    } catch { return unavailable(); }
  }
  let library;
  let expectedRevision;
  try {
    const body = personalLibraryBackupRecord(await personalLibraryBackupReadBody(request), '备份请求');
    expectedRevision = body.expectedRevision;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error('备份修订号无效，请重新加载备份。');
    library = personalLibraryBackupContent(body.library);
  } catch (error) {
    if (error instanceof RangeError && error.message === 'backup_too_large') return tooLarge();
    return json({ error: 'invalid_backup', message: error instanceof SyntaxError ? '备份 JSON 格式错误。' : error.message }, 400);
  }
  const payload = JSON.stringify(library);
  if (new TextEncoder().encode(payload).byteLength > personalLibraryBackupMaxBytes) return tooLarge();
  const updatedAt = new Date().toISOString();
  const revision = expectedRevision + 1;
  try {
    const result = expectedRevision === 0
      ? await env.DB.prepare('INSERT INTO personal_library_backups (user_id, revision, payload_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING').bind(user.id, revision, payload, updatedAt).run()
      : await env.DB.prepare('UPDATE personal_library_backups SET revision = ?, payload_json = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(revision, payload, updatedAt, user.id, expectedRevision).run();
    if (result?.success === false || result?.meta?.changes === undefined) return unavailable();
    if (Number(result.meta.changes) === 0) {
      const latest = await personalLibraryBackupReadRow(env.DB, user.id);
      return json({ error: 'backup_conflict', message: '账号已有较新的备份，请重新加载后再确认保存。', backup: personalLibraryBackupMetadata(latest) }, 409);
    }
    if (Number(result.meta.changes) !== 1) return unavailable();
    return json({ backup: { revision, updatedAt, library } }, 200);
  } catch { return unavailable(); }
}
