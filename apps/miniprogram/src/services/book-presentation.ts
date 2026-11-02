import type { Book } from "@jp/models";

export type CoverScene = "town" | "train" | "cafe" | "bridge" | "table" | "museum" | "garden";
export type BookCategory = "textbook" | "jlpt" | "custom";

interface Edition {
  volume: string;
  scene: CoverScene;
  caption: string;
}

const editions: Record<string, Edition> = {
  "biaori-beginner-upper": { volume: "初级上册", scene: "town", caption: "从问候，到日常" },
  "biaori-beginner-lower": { volume: "初级下册", scene: "train", caption: "把日语带进生活" },
  "biaori-intermediate-upper": { volume: "中级上册", scene: "cafe", caption: "相遇、交流与表达" },
  "biaori-intermediate-lower": { volume: "中级下册", scene: "bridge", caption: "连接更宽的世界" },
  "biaori-advanced-upper": { volume: "高级上册", scene: "table", caption: "生活里的文化与思考" },
  "biaori-advanced-lower": { volume: "高级下册", scene: "museum", caption: "读懂社会与人文" },
};

const exams: Record<string, Edition> = {
  "jlpt-n5": { volume: "N5", scene: "garden", caption: "从基础，慢慢生长" },
  "jlpt-n4": { volume: "N4", scene: "town", caption: "让日常表达更自在" },
  "jlpt-n3": { volume: "N3", scene: "cafe", caption: "在交流中走向进阶" },
  "jlpt-n2": { volume: "N2", scene: "bridge", caption: "连接阅读与理解" },
  "jlpt-n1": { volume: "N1", scene: "museum", caption: "探索语言的深处" },
};

export function bookCategory(book: Pick<Book, "id">): BookCategory {
  return editions[book.id] ? "textbook" : exams[book.id] ? "jlpt" : "custom";
}

export function fullBookTitle(book: Pick<Book, "id" | "title">): string {
  if (editions[book.id]) return `新版标准日本语${editions[book.id].volume}`;
  if (exams[book.id]) return `JLPT ${exams[book.id].volume} 备考词汇`;
  return book.title;
}

/** Presentation metadata mirrors the original Web covers and is keyed by stable book id. */
export function bookPresentation(book: Pick<Book, "id" | "title" | "description">) {
  const edition = editions[book.id];
  if (edition) {
    return { ...edition, title: fullBookTitle(book), series: "新版标准日本语", exam: false };
  }
  const exam = exams[book.id];
  if (exam) {
    return { ...exam, title: fullBookTitle(book), series: "JLPT / 备考词汇", exam: true };
  }
  return {
    volume: book.title,
    scene: "garden" as const,
    caption: "一词一句，慢慢积累",
    title: book.title,
    series: "KOTOBUD COLLECTION",
    exam: false,
  };
}
