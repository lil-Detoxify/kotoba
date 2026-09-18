import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, '.cache/textbook-research/biaori-src/biaori-main/words.json');
const outputPath = path.join(root, 'apps/web/src/textbooks.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(source)) throw new Error('words.json must contain an array');
for (const [index, row] of source.entries()) {
  if (!Array.isArray(row) || row.length < 4) throw new Error(`words.json row ${index + 1} must have code, pos, meaning, reading`);
  if (!Number.isInteger(row[0]) || typeof row[1] !== 'string' || typeof row[2] !== 'string' || typeof row[3] !== 'string') throw new Error(`words.json row ${index + 1} has invalid field types`);
}

const specs = [
  ['biaori-beginner-upper', '标日初级上', 0, 1, 24],
  ['biaori-beginner-lower', '标日初级下', 0, 25, 48],
  ['biaori-intermediate-upper', '标日中级上', 1, 1, 16],
  ['biaori-intermediate-lower', '标日中级下', 1, 17, 32],
  ['biaori-advanced-upper', '标日高级上', 2, 1, 12],
  ['biaori-advanced-lower', '标日高级下', 2, 13, 24],
];
const clean = value => String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const expandTildeAbbreviation = (reading, parens) => {
  if (!parens || !/[～〜~]/.test(parens) || /[～〜~]/.test(reading)) return parens;
  if (parens === '～朝～' && reading === 'ササンちょうペルシャ') return 'ササン朝ペルシャ';
  if (parens === '陝西～救護飼養～' && reading === 'せんせいトキきゅうごしようセンター') return '陝西トキ救護飼養センター';
  if (parens === '佐渡～保護～' && reading === 'さどトキほごセンター') return '佐渡トキ保護センター';
  if (parens === '～王立科学～' && reading === 'スウェーデンおうりつかがくアカデミー') return 'スウェーデン王立科学アカデミー';
  if (parens === '～触媒～反応' && reading === 'パラジウムしょくばいクロスカップリングはんのう') return 'パラジウム触媒クロスカップリング反応';
  if (!/^[～〜~]/.test(parens) && !/[～〜~]$/.test(parens) && (parens.match(/[～〜~]/g) || []).length === 1) {
    if (parens === '段～箱' && reading === 'だんボールばこ') return '段ボール箱';
    if (parens === '100万～の夜景' && reading === 'ひゃくまんドルのやけい') return '100万ドルの夜景';
    if (parens === 'とり肉の～炒め' && reading === 'とりにくのカシューナッツいため') return 'とり肉のカシューナッツ炒め';
    if (parens === '中国～保护支援基金' && reading === 'ちゅうごくトキほごしえんききん') return '中国トキ保護支援基金';
    if (parens === '中国～保護支援基金' && reading === 'ちゅうごくトキほごしえんききん') return '中国トキ保護支援基金';
    if (parens === '中国～保護観察団' && reading === 'ちゅうごくトキほごかんさつだん') return '中国トキ保護観察団';
    if (parens === '『赤い～』' && reading === 'あかいコーリャン') return '『赤いコーリャン』';
    if (parens === '『～の森』' && reading === 'ノルウェイのもり') return '『ノルウェイの森』';
    if (parens === '新疆～自治区' && reading === 'しんきょうウイグルじちく') return '新疆ウイグル自治区';
    if (parens === '広西～族自治区' && reading === 'こうせいチワンぞくじちく') return '広西チワン族自治区';
    if (parens === 'お／ご～申し上げる' && reading === 'お／ご～もうしあげる') return parens;
  }
  if (/^[～〜~]/.test(parens) && !/[～〜~]$/.test(parens) && (parens.match(/[～〜~]/g) || []).length === 1) {
    const suffix = parens.replace(/^[～〜~]/, '');
    const kataMatch = reading.match(/^([\u30a0-\u30ffーA-Za-z0-9]+)(.*)$/);
    if (kataMatch) return kataMatch[1] + suffix;
    if (reading.startsWith('よろしく') && (suffix.startsWith('お願い') || suffix.startsWith('お伝え'))) return 'よろしく' + suffix;
    if (reading.startsWith('おせち') && suffix === '料理') return 'おせち' + suffix;
    if (parens === '『～の森』' && reading === 'ノルウェイのもり') return '『ノルウェイの森』';
  }
  if (/[～〜~]$/.test(parens) && !/^[～〜~]/.test(parens) && (parens.match(/[～〜~]/g) || []).length === 1) {
    const prefix = parens.replace(/[～〜~]$/, '');
    if (reading.endsWith('します')) return prefix + 'します';
    if (reading.endsWith('する')) return prefix + 'する';
    if (reading.endsWith('になる')) return prefix + 'になる';
    if (reading.endsWith('ずる')) return prefix + 'ずる';
    if (reading.endsWith('できます')) return prefix + 'できます';
    if (reading.endsWith('なさいます')) return prefix + 'なさいます';
    if (reading.endsWith('いたします')) return prefix + 'いたします';
    if (reading.endsWith('くださいます')) return prefix + 'くださいます';
    if (reading.endsWith('あります')) return prefix + 'あります';
    if (reading.endsWith('まいります')) return prefix + 'まいります';
    if (reading.endsWith('おります')) return prefix + 'おります';
    if (reading.endsWith('ございます')) return prefix + 'ございます';
    if (reading.endsWith('ごみ')) return prefix + 'ごみ';
    if (reading.endsWith('ぐつ')) return prefix + 'ぐつ';
    const kataSuffixMatch = reading.match(/^(.*?)([\u30a0-\u30ffー]+)$/);
    if (kataSuffixMatch && kataSuffixMatch[2].length >= 2) return prefix + kataSuffixMatch[2];
  }
  return parens;
};

const parseReading = value => {
  const text = clean(value).split(/[／/]/, 1)[0].replace(/\s*［[^］]*］\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const match = text.match(/^(.*?)\s*(?:（|\()([^（）()]*)/);
  if (!match) return { reading: text, term: text };
  const reading = match[1].trim();
  const rawTerm = match[2].trim();
  const term = expandTildeAbbreviation(reading, rawTerm);
  return { reading: reading || term, term: term || reading, rawTerm: rawTerm !== term ? rawTerm : undefined };
};

const books = specs.map(([id, title, level, firstLesson, lastLesson]) => {
  const lessons = [];
  for (let lesson = firstLesson; lesson <= lastLesson; lesson++) {
    const rows = source.map((row, sourceIndex) => ({ row, sourceIndex })).filter(({ row }) => Math.floor(row[0] / 10000) === level && row[0] % 100 + 1 === lesson);
    lessons.push({ title: `第${lesson}课`, order: lesson, words: rows.map(({ row, sourceIndex }) => {
      const parsed = parseReading(row[3]);
      return { term: parsed.term, reading: parsed.reading, meaning: clean(row[2]), partOfSpeech: clean(row[1]), sourceCode: row[0], sourceIndex, rawTerm: parsed.rawTerm };
    }) });
  }
  return { id, title, description: '标日词汇 · 来源：biaori 开放词表；仅含词汇与课次。', lessons, wordCount: lessons.reduce((n, l) => n + l.words.length, 0) };
});
const payload = { source: 'smartsl/biaori', books };
fs.writeFileSync(outputPath, JSON.stringify(payload));
console.log(JSON.stringify({ sourceRows: source.length, books: books.map(b => ({ id: b.id, lessons: b.lessons.length, words: b.wordCount })) }, null, 2));
