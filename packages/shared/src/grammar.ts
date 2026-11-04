export const GRAMMAR_BOOK_ID = 'biaori-beginner-upper';
export const LOWER_GRAMMAR_BOOK_ID = 'biaori-beginner-lower';
type GrammarBookId = typeof GRAMMAR_BOOK_ID | typeof LOWER_GRAMMAR_BOOK_ID;
export interface GrammarExample {
  ja: string; reading: string; zh: string;
  parts: Array<{ text: string; label: string }>;
}
export interface GrammarPoint {
  id: string; title: string; meaning: string; connection: string;
  explanation: string; tip: string; examples: GrammarExample[];
}
export interface GrammarQuestion {
  id: string; pointId: string; kind: 'choice' | 'cloze'; prompt: string;
  sentence?: { before: string; after: string };
  options: string[]; answer: string; explanation: string;
}
export interface GrammarLesson {
  bookId?: GrammarBookId;
  order: number; title: string; summary: string;
  sourcePages: number[]; sourcePdfPages: number[];
  points: GrammarPoint[]; questions: GrammarQuestion[];
}
export interface GrammarSession {
  questionIds: string[]; index: number; answers: Record<string, string>;
}
export interface GrammarProgress {
  version: 1; phase: 'read' | 'practice' | 'summary'; currentPointId: string;
  understood: string[]; firstAnswers: Record<string, string>;
  lastAnswers: Record<string, string>; session?: GrammarSession;
}
export interface GrammarStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const storageKey = (account: string, lesson: GrammarLesson) =>
  `kotobud.grammar.v1:${encodeURIComponent(account)}:${lesson.bookId ?? GRAMMAR_BOOK_ID}:${lesson.order}`;

export function createGrammarProgress(lesson: GrammarLesson): GrammarProgress {
  return { version: 1, phase: 'read', currentPointId: lesson.points[0].id,
    understood: [], firstAnswers: {}, lastAnswers: {} };
}

export function loadGrammarProgress(lesson: GrammarLesson, account: string, storage: GrammarStorage): GrammarProgress {
  const fresh = createGrammarProgress(lesson);
  try {
    const raw = JSON.parse(storage.getItem(storageKey(account, lesson)) ?? 'null');
    if (!raw || raw.version !== 1) return fresh;
    const pointIds = new Set(lesson.points.map(point => point.id));
    const questionById = new Map(lesson.questions.map(question => [question.id, question]));
    const answers = (value: unknown): Record<string, string> => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([id, answer]) => typeof answer === 'string' && questionById.get(id)?.options.includes(answer))) : {};
    const progress: GrammarProgress = {
      ...fresh,
      currentPointId: pointIds.has(raw.currentPointId) ? raw.currentPointId : fresh.currentPointId,
      understood: Array.isArray(raw.understood) ? [...new Set<string>(raw.understood.filter((id: unknown) => typeof id === 'string' && pointIds.has(id)))] : [],
      firstAnswers: answers(raw.firstAnswers), lastAnswers: answers(raw.lastAnswers),
    };
    const session = raw.session;
    if (session && Array.isArray(session.questionIds) && session.questionIds.length > 0
      && session.questionIds.length <= lesson.questions.length
      && new Set(session.questionIds).size === session.questionIds.length
      && session.questionIds.every((id: unknown) => typeof id === 'string' && questionById.has(id))
      && Number.isInteger(session.index) && session.index >= 0 && session.index <= session.questionIds.length) {
      const sessionAnswers = answers(session.answers);
      if (session.questionIds.slice(0, session.index).every((id: string) => sessionAnswers[id])) {
        progress.session = { questionIds: session.questionIds, index: session.index, answers: sessionAnswers };
        if (raw.phase === 'practice' && session.index < session.questionIds.length) progress.phase = 'practice';
        if (raw.phase === 'summary' && session.index === session.questionIds.length) progress.phase = 'summary';
      }
    }
    return progress;
  } catch { return fresh; }
}

export function saveGrammarProgress(lesson: GrammarLesson, account: string, progress: GrammarProgress, storage: GrammarStorage): boolean {
  try { storage.setItem(storageKey(account, lesson), JSON.stringify(progress)); return true; }
  catch { return false; }
}

export function grammarWrongQuestions(lesson: GrammarLesson, progress: GrammarProgress): GrammarQuestion[] {
  return lesson.questions.filter(question => progress.lastAnswers[question.id] && progress.lastAnswers[question.id] !== question.answer);
}

export function beginGrammarPractice(lesson: GrammarLesson, progress: GrammarProgress, wrongOnly = false): GrammarProgress {
  if (!wrongOnly && progress.session && progress.session.index < progress.session.questionIds.length) return { ...progress, phase: 'practice' };
  const questions = wrongOnly ? grammarWrongQuestions(lesson, progress) : lesson.questions;
  if (!questions.length) return progress;
  return { ...progress, phase: 'practice', session: { questionIds: questions.map(question => question.id), index: 0, answers: {} } };
}

export function answerGrammarQuestion(lesson: GrammarLesson, progress: GrammarProgress, questionId: string, answer: string): GrammarProgress {
  const session = progress.session;
  if (progress.phase !== 'practice' || !session || session.questionIds[session.index] !== questionId || session.answers[questionId]) return progress;
  const question = lesson.questions.find(item => item.id === questionId);
  if (!question?.options.includes(answer)) return progress;
  return { ...progress,
    firstAnswers: { ...progress.firstAnswers, [questionId]: progress.firstAnswers[questionId] ?? answer },
    lastAnswers: { ...progress.lastAnswers, [questionId]: answer },
    session: { ...session, answers: { ...session.answers, [questionId]: answer } },
  };
}

export function advanceGrammarPractice(progress: GrammarProgress): GrammarProgress {
  const session = progress.session;
  if (progress.phase !== 'practice' || !session || !session.answers[session.questionIds[session.index]]) return progress;
  const index = session.index + 1;
  return { ...progress, phase: index === session.questionIds.length ? 'summary' : 'practice', session: { ...session, index } };
}
