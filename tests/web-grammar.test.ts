import { describe, expect, it } from 'vitest';
import { grammarAfterVocabulary } from '../apps/web/src/services/grammar-navigation';
import {
  grammarLessons, lowerGrammarLessons, createGrammarProgress, beginGrammarPractice, answerGrammarQuestion,
  advanceGrammarPractice, grammarWrongQuestions, loadGrammarProgress, saveGrammarProgress,
} from '../apps/web/src/services/grammar';

describe('lesson grammar', () => {
  it('links a single beginner lesson to its matching grammar and skips mixed lesson rounds', () => {
    const lessons = [
      {id:'upper', bookId:'biaori-beginner-upper', title:'第13课', order:13},
      {id:'lower', bookId:'biaori-beginner-lower', title:'第25课', order:25},
      {id:'jlpt', bookId:'jlpt-n5', title:'第1组', order:1},
    ];
    const word = (lessonId: string) => ({id:lessonId, lessonId, term:'本', reading:'ほん', meaning:'书', order:1});
    expect(grammarAfterVocabulary(lessons,[word('upper')])?.href).toBe('/grammar/biaori-beginner-upper/13');
    expect(grammarAfterVocabulary(lessons,[word('lower')])?.href).toBe('/grammar/biaori-beginner-lower/25');
    expect(grammarAfterVocabulary(lessons,[word('upper'),word('lower')])).toBeUndefined();
    expect(grammarAfterVocabulary(lessons,[word('jlpt')])).toBeUndefined();
  });
  it('keeps complete, uniquely answerable lesson data with source pages and example breakdowns', () => {
    expect(grammarLessons.map(lesson => lesson.order)).toEqual(Array.from({length: 24}, (_, index) => index + 1));
    expect(lowerGrammarLessons.map(lesson => lesson.order)).toEqual(Array.from({length: 24}, (_, index) => index + 25));
    const ids = new Set<string>();
    for (const lesson of [...grammarLessons, ...lowerGrammarLessons]) {
      expect(lesson.questions.length).toBeGreaterThanOrEqual(8);
      const pageOffset = lesson.order <= 24 ? 17 : 16;
      expect(lesson.sourcePdfPages).toEqual(lesson.sourcePages.map(page => page + pageOffset));
      expect(new Set(lesson.questions.map(question => question.kind))).toEqual(new Set(['choice', 'cloze']));
      for (const point of lesson.points) {
        expect(ids.has(point.id)).toBe(false); ids.add(point.id);
        expect(point.examples).toHaveLength(2);
        expect(lesson.questions.some(question => question.pointId === point.id)).toBe(true);
        for (const example of point.examples) expect(example.parts.map(part => part.text).join('')).toBe(example.ja);
      }
      for (const question of lesson.questions) {
        expect(ids.has(question.id)).toBe(false); ids.add(question.id);
        expect(lesson.points.some(point => point.id === question.pointId)).toBe(true);
        expect(new Set(question.options).size).toBe(question.options.length);
        expect(question.options.filter(option => option === question.answer)).toHaveLength(1);
        if (question.kind === 'cloze') {
          expect(question.sentence).toBeDefined();
          expect(typeof question.sentence!.before).toBe('string');
          expect(typeof question.sentence!.after).toBe('string');
          expect(question.sentence!.before + question.sentence!.after).not.toMatch(/（\s*）|_{3}/);
        }
      }
    }
  });

  it('resumes a revealed answer across refresh and rejects double submission or skipping', () => {
    const lesson = grammarLessons[0];
    let progress = beginGrammarPractice(lesson, createGrammarProgress(lesson));
    expect(advanceGrammarPractice(progress)).toBe(progress);
    const question = lesson.questions[0];
    expect(answerGrammarQuestion(lesson, progress, lesson.questions[1].id, lesson.questions[1].answer)).toBe(progress);
    progress = answerGrammarQuestion(lesson, progress, question.id, question.answer);
    expect(answerGrammarQuestion(lesson, progress, question.id, question.options.find(option => option !== question.answer)!)).toBe(progress);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(saveGrammarProgress(lesson, 'learner', progress, storage)).toBe(true);
    const restored = loadGrammarProgress(lesson, 'learner', storage);
    expect(restored).toEqual(progress);
    expect(advanceGrammarPractice(restored).session?.index).toBe(1);
  });

  it('retries only mistakes while preserving the first answer', () => {
    const lesson = grammarLessons[0], first = lesson.questions[0];
    const initialWrong = first.options.find(option => option !== first.answer)!;
    let progress = beginGrammarPractice(lesson, createGrammarProgress(lesson));
    for (const question of lesson.questions) {
      progress = answerGrammarQuestion(lesson, progress, question.id, question === first ? initialWrong : question.answer);
      progress = advanceGrammarPractice(progress);
    }
    expect(progress.phase).toBe('summary');
    expect(grammarWrongQuestions(lesson, progress).map(question => question.id)).toEqual([first.id]);
    progress = beginGrammarPractice(lesson, progress, true);
    expect(progress.session?.questionIds).toEqual([first.id]);
    progress = answerGrammarQuestion(lesson, progress, first.id, first.answer);
    expect(progress.firstAnswers[first.id]).toBe(initialWrong);
    expect(progress.lastAnswers[first.id]).toBe(first.answer);
    expect(grammarWrongQuestions(lesson, progress)).toEqual([]);
    expect(advanceGrammarPractice(progress).phase).toBe('summary');
  });

  it('keeps account and lesson progress separate and recovers a damaged session', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const lesson = grammarLessons[1], progress = beginGrammarPractice(lesson, createGrammarProgress(lesson));
    saveGrammarProgress(lesson, 'account-a', progress, storage);
    expect(loadGrammarProgress(lesson, 'account-b', storage).phase).toBe('read');
    expect(loadGrammarProgress(grammarLessons[0], 'account-a', storage).phase).toBe('read');
    values.set([...values.keys()][0], JSON.stringify({ ...progress, session: { ...progress.session, index: 500 } }));
    expect(loadGrammarProgress(lesson, 'account-a', storage).session).toBeUndefined();
  });

  it('keeps learning usable when local storage is unavailable', () => {
    const lesson = grammarLessons[0];
    const storage = { getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); } };
    expect(loadGrammarProgress(lesson, 'local', storage)).toEqual(createGrammarProgress(lesson));
    expect(saveGrammarProgress(lesson, 'local', createGrammarProgress(lesson), storage)).toBe(false);
  });

  it('reads existing upper-book progress and saves lower-book progress separately', () => {
    const [upper] = grammarLessons, [lower] = lowerGrammarLessons;
    const upperProgress = beginGrammarPractice(upper, createGrammarProgress(upper));
    const upperKey = 'kotobud.grammar.v1:learner:biaori-beginner-upper:1';
    const previousValue = JSON.stringify(upperProgress);
    const values = new Map([[upperKey, previousValue]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const lowerProgress = beginGrammarPractice(lower, createGrammarProgress(lower));
    expect(loadGrammarProgress(upper, 'learner', storage)).toEqual(upperProgress);
    expect(saveGrammarProgress(lower, 'learner', lowerProgress, storage)).toBe(true);
    expect(values.get(upperKey)).toBe(previousValue);
    expect(values.has('kotobud.grammar.v1:learner:biaori-beginner-lower:25')).toBe(true);
    expect(loadGrammarProgress(lower, 'learner', storage)).toEqual(lowerProgress);
  });
});
