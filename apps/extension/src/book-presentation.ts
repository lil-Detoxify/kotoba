export type CoverScene = 'town' | 'train' | 'cafe' | 'bridge' | 'table' | 'museum' | 'garden';
export type BookCategory = 'textbook' | 'jlpt' | 'custom';

export interface BookPresentationInput {
  id: string;
  title: string;
  description: string;
}

const editions: Record<string, { volume: string; scene: CoverScene; caption: string }> = {
  'biaori-beginner-upper': { volume: '初级上册', scene: 'town', caption: '从问候，到日常' },
  'biaori-beginner-lower': { volume: '初级下册', scene: 'train', caption: '把日语带进生活' },
  'biaori-intermediate-upper': { volume: '中级上册', scene: 'cafe', caption: '相遇、交流与表达' },
  'biaori-intermediate-lower': { volume: '中级下册', scene: 'bridge', caption: '连接更宽的世界' },
  'biaori-advanced-upper': { volume: '高级上册', scene: 'table', caption: '生活里的文化与思考' },
  'biaori-advanced-lower': { volume: '高级下册', scene: 'museum', caption: '读懂社会与人文' },
};

const exams: Record<string, { volume: string; scene: CoverScene; caption: string }> = {
  'jlpt-n5': { volume: 'N5', scene: 'garden', caption: '从基础，慢慢生长' },
  'jlpt-n4': { volume: 'N4', scene: 'town', caption: '让日常表达更自在' },
  'jlpt-n3': { volume: 'N3', scene: 'cafe', caption: '在交流中走向进阶' },
  'jlpt-n2': { volume: 'N2', scene: 'bridge', caption: '连接阅读与理解' },
  'jlpt-n1': { volume: 'N1', scene: 'museum', caption: '探索语言的深处' },
};

export function bookCategory(book: Pick<BookPresentationInput, 'id'>): BookCategory {
  if (editions[book.id]) return 'textbook';
  return exams[book.id] ? 'jlpt' : 'custom';
}

export function fullBookTitle(book: Pick<BookPresentationInput, 'id' | 'title'>): string {
  const edition = editions[book.id];
  if (edition) return `新版标准日本语${edition.volume}`;
  const exam = exams[book.id];
  return exam ? `JLPT ${exam.volume} 备考词汇` : book.title;
}

/** Stable art and names keyed by book identity, independent of display order. */
export function bookPresentation(book: BookPresentationInput, content = '') {
  const edition = editions[book.id];
  if (edition) {
    return {
      ...edition,
      title: fullBookTitle(book),
      series: '新版标准日本语',
      custom: false,
      exam: false,
    };
  }

  const exam = exams[book.id];
  if (exam) {
    return {
      ...exam,
      title: fullBookTitle(book),
      series: 'JLPT / 备考词汇',
      custom: false,
      exam: true,
    };
  }

  const text = `${book.title} ${book.description} ${content}`;
  let scene: CoverScene = 'garden';
  if (/测试词书/.test(book.title)) scene = 'garden';
  else if (/旅行|旅游|交通|车站|駅|電車|出行/.test(text)) scene = 'train';
  else if (/文化|历史|艺术|博物|文学|社会/.test(text)) scene = 'museum';
  else if (/饮食|料理|餐|食卓|ご飯/.test(text)) scene = 'table';
  else if (/交流|工作|商务|会话|相遇/.test(text)) scene = 'cafe';
  else if (/日常|初次|基础|初级/.test(text)) scene = 'town';
  return {
    title: book.title,
    series: 'KOTOBUD COLLECTION',
    volume: book.title,
    scene,
    caption: '一词一句，慢慢积累',
    custom: true,
    exam: false,
  };
}

/** JLPT source material is bundled with the unpacked extension for offline reading. */
export function bookSourceUrl(book: Pick<BookPresentationInput, 'id'>): string | undefined {
  return exams[book.id] ? 'data/DATA-SOURCES.txt' : undefined;
}
