import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { emptyData, type Data, type ReadingContext } from '@jp/models';
import { initialState } from '@jp/core';

const harness = vi.hoisted(() => ({ repo: null as any, auth: null as any }));
vi.mock('@jp/storage', () => {
  const repo = {
    activeKey: 'data_guest', values: new Map<string, Data>(),
    getActiveKey() { return this.activeKey; },
    switchUser(id: string | null) { this.activeKey = id ? `data_user_${id}` : 'data_guest'; },
    async read(key?: string) { return structuredClone(repo.values.get(key ?? repo.activeKey) ?? emptyData()); },
    async transact(change: (data: Data) => void, key?: string) { const target = key ?? repo.activeKey; const data = await repo.read(target); change(data); repo.values.set(target, structuredClone(data)); return data; },
    async enqueue() {}, async getQueue() { return []; }, async close() {}, async open() {},
  };
  harness.repo = repo;
  return { IndexedDbRepository: class { constructor() { return repo; } }, deleteBook: vi.fn() };
});
vi.mock('@jp/sync', () => {
  const auth = { user: null as any, getCurrentUser() { return this.user; } }; harness.auth = auth;
  class MockAuthClient { constructor() { return auth; } }
  class WorkerSyncClient {}
  return { MockAuthClient, CloudBaseAuthClient: MockAuthClient, WorkerSyncClient };
});
import { useApp } from '../apps/web/src/store';
import { useStudyPlanPreference } from '../apps/web/src/services/study-plan-preference';
import { dailyStudyPlan } from '../apps/web/src/services/daily-study-plan';
import { useStudyExercisePreference } from '../apps/web/src/services/study-exercise-preference';

function fixture(): Data {
  const data = emptyData(); data.seeded = true;
  data.books = [{ id: 'resume-book', title: '续学测试', description: '', language: 'ja', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' }];
  data.lessons = [{ id: 'resume-book-l-1', bookId: 'resume-book', title: '第一课', order: 1 }, { id: 'resume-book-l-2', bookId: 'resume-book', title: '第二课', order: 2 }];
  data.words = ['word-a', 'word-b', 'word-c', 'word-next-lesson'].map((id, i) => ({ id, lessonId: i < 3 ? 'resume-book-l-1' : 'resume-book-l-2', term: ['言葉', '毎日', '記憶', '本'][i], reading: ['ことば', 'まいにち', 'きおく', 'ほん'][i], meaning: ['词语', '每天', '记忆', '书'][i], order: i + 1 }));
  data.currentBookId = 'resume-book'; return data;
}
let storageValues: Map<string, string>;
beforeEach(() => {
  setActivePinia(createPinia()); harness.repo.activeKey = 'data_guest'; harness.repo.values.clear(); harness.auth.user = null;
  harness.repo.values.set('data_guest', fixture()); storageValues = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storageValues.get(key) ?? null, setItem: (key: string, value: string) => storageValues.set(key, value), removeItem: (key: string) => storageValues.delete(key) });
  useStudyPlanPreference().setPace('resume-book', 1);
  useStudyExercisePreference().setExercise('auto');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Web home continuation through the actual study store', () => {
  it('starts only the selected original sentence without grading or changing the current book', async () => {
    const data=fixture();
    const original:ReadingContext={id:'context-a',sentence:'言葉を覚えました。',translation:'记住了词语。',matchedText:'言葉',createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'};
    data.words[0]={...data.words[0],readingContexts:[original]};
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();
    const currentBook=app.data.currentBookId;
    const beforeStates=JSON.stringify(app.data.states);
    expect(await app.startReadingContextPractice([{wordId:'word-a',contextId:'context-a'}])).toBe(true);
    expect(app.queue.map(word=>word.id)).toEqual(['word-a']);
    expect(app.mode).toBe('difficult');
    expect(app.sessionExercise).toBe('sentence-cloze');
    expect(app.studySession?.readingContextIds).toEqual({'word-a':'context-a'});
    expect(app.data.currentBookId).toBe(currentBook);
    expect(JSON.stringify(app.data.states)).toBe(beforeStates);
    expect(app.data.logs).toEqual([]);
    expect(JSON.parse(storageValues.get('kotobud.web.study-session.v1:data_guest')!).readingContextIds).toEqual({'word-a':'context-a'});
  });

  it('keeps the selected original sentence ID after refresh and continuation', async () => {
    const data=fixture();
    data.words[0]={...data.words[0],readingContexts:[{id:'context-a',sentence:'言葉を覚えました。',matchedText:'言葉',createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'}]};
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();
    expect(await app.startReadingContextPractice([{wordId:'word-a',contextId:'context-a'}])).toBe(true);
    setActivePinia(createPinia());const reopened=useApp();await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true);
    expect(reopened.queue[reopened.index].id).toBe('word-a');
    expect(reopened.studySession?.readingContextIds).toEqual({'word-a':'context-a'});
    expect(JSON.parse(storageValues.get('kotobud.web.study-session.v1:data_guest')!).readingContextIds).toEqual({'word-a':'context-a'});
    expect(reopened.data.logs).toEqual([]);
  });

  it('uses the configured mode for a new round while continuing preserves the saved mode',async()=>{
    const preference=useStudyExercisePreference();preference.setExercise('kana-meaning');
    const app=useApp();await app.refresh();await app.start('new',['resume-book-l-1'],'resume-book');
    expect(app.sessionExercise).toBe('kana-meaning');
    await app.rate(3,100);
    preference.setExercise('card');
    const before=JSON.stringify(harness.repo.values.get('data_guest'));
    setActivePinia(createPinia());const reopened=useApp();await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true);
    expect(reopened.sessionExercise).toBe('kana-meaning');
    expect(reopened.queue[reopened.index].id).toBe('word-b');
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
    expect(await reopened.start('new',['resume-book-l-2'],'resume-book')).toBe(true);
    expect(reopened.sessionExercise).toBe('card');
  });
  it('keeps cloze practice and all explicitly chosen words when retrying across loaded books',async()=>{
    const data=fixture();
    data.words[0]={...data.words[0],term:'青',reading:'あお'};
    data.books.push({...data.books[0],id:'other-book',title:'另一词书'});
    data.lessons.push({id:'other-lesson',bookId:'other-book',title:'其他课',order:1});
    data.words.push({id:'other-word',lessonId:'other-lesson',term:'赤',reading:'あか',meaning:'红色',order:1});
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();
    useStudyExercisePreference().setExercise('audio-meaning');
    expect(await app.startFocusedPractice(['word-a','other-word'],'sentence-cloze')).toBe(true);
    expect(app.queue.map(word=>word.id)).toEqual(['word-a','other-word']);
    expect(app.sessionExercise).toBe('sentence-cloze');
    expect(app.data.logs).toHaveLength(0);
  });
  it('starts only examples in the chosen lessons, without flagging or grading the skipped words',async()=>{
    useStudyExercisePreference().setExercise('audio-meaning');
    const data=fixture();
    data.words[0]={...data.words[0],term:'青',reading:'あお'};
    data.words[1]={...data.words[1],term:'unsupported',reading:'unsupported'};
    data.words[2]={...data.words[2],term:'赤',reading:'あか'};
    data.words[3]={...data.words[3],term:'医者',reading:'いしゃ'};
    data.states=[{...initialState('word-c',new Date()),isIgnored:true}];
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();
    expect(await app.startSentencePractice(['resume-book-l-1'],'resume-book')).toBe(true);
    expect(app.queue.map(word=>word.id)).toEqual(['word-a']);
    expect(app.sessionExercise).toBe('sentence-cloze');
    expect(app.studySession?.focusedPractice).toBe(true);
    expect(app.data.logs).toHaveLength(0);
    expect(app.data.states.some(state=>state.isDifficult)).toBe(false);
    setActivePinia(createPinia());const reopened=useApp();await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true);
    expect(reopened.sessionExercise).toBe('sentence-cloze');
    expect(reopened.queue.map(word=>word.id)).toEqual(['word-a']);
    const checkpoint=storageValues.get('kotobud.web.study-session.v1:data_guest');
    expect(await reopened.startSentencePractice(['missing'],'resume-book')).toBe(false);
    expect(storageValues.get('kotobud.web.study-session.v1:data_guest')).toBe(checkpoint);
    expect(reopened.queue.map(word=>word.id)).toEqual(['word-a']);
  });
  it('starts focused practice for a future-due word and restores its cloze mode without marking it difficult', async () => {
    const data=fixture();
    data.states=[{...initialState('word-a',new Date()),status:'review',reviewCount:2,firstSeenAt:'2026-10-01T00:00:00Z',nextReviewAt:'2099-01-01T00:00:00Z'}];
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();
    const before=JSON.stringify(harness.repo.values.get('data_guest'));
    expect(await app.startFocusedPractice(['word-a','word-a'])).toBe(true);
    expect(app.queue.map(word=>word.id)).toEqual(['word-a']);
    app.setSessionExercise('sentence-cloze');
    setActivePinia(createPinia());const reopened=useApp();await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true);
    expect(reopened.sessionExercise).toBe('sentence-cloze');
    expect(reopened.queue.map(word=>word.id)).toEqual(['word-a']);
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
  });
  it('restores the next uncompleted word after recreating the store without selecting lessons or writing grades', async () => {
    const first = useApp(); await first.refresh(); await first.start('new', ['resume-book-l-1'], 'resume-book'); await first.rate(3, 500);
    expect(first.queue[first.index].id).toBe('word-b');
    const before = JSON.stringify(harness.repo.values.get('data_guest'));
    setActivePinia(createPinia()); const reopened: any = useApp(); await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true);
    expect(reopened.queue[reopened.index].id).toBe('word-b'); expect(reopened.sessionSize).toBe(3); expect(reopened.mode).toBe('new');
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
  });
  it('uses the most recent unfinished lesson directly when upgrading from a version without a checkpoint', async () => {
    const app = useApp(); await app.refresh(); await app.start('new', ['resume-book-l-1'], 'resume-book'); await app.rate(3, 100);
    storageValues.clear(); const before = JSON.stringify(harness.repo.values.get('data_guest'));
    setActivePinia(createPinia()); const reopened = useApp(); await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true);
    expect(reopened.queue.map(word => word.id)).toEqual(['word-b', 'word-c']);
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
  });
  it('preserves the chosen exercise and skips an already committed word when checkpoint storage was unavailable', async () => {
    const app = useApp(); await app.refresh(); await app.start('new', ['resume-book-l-1'], 'resume-book'); app.setSessionExercise('kana-meaning');
    const storage = globalThis.localStorage;
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await app.rate(3, 200); expect(app.index).toBe(1);
    const before = JSON.stringify(harness.repo.values.get('data_guest'));
    setActivePinia(createPinia()); const reopened = useApp(); await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true); expect(reopened.queue[reopened.index].id).toBe('word-b'); expect(reopened.index).toBe(1);
    expect(reopened.sessionExercise).toBe('kana-meaning');
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
  });
  it('keeps guest and account checkpoints separate and clears the previous in-memory queue immediately', async () => {
    const guest = useApp(); await guest.refresh(); await guest.start('new', ['resume-book-l-1'], 'resume-book'); await guest.rate(3, 100);
    const guestBefore = JSON.stringify(harness.repo.values.get('data_guest'));
    const user = { id: 'resume-user', email: 'resume@example.test', provider: 'test' };
    const accountData = fixture(); accountData.words = accountData.words.map(word => ({ ...word, id: 'account-' + word.id }));
    harness.repo.values.set('data_user_resume-user', accountData); harness.repo.switchUser(user.id); harness.auth.user = user; guest.currentUser = user;
    expect(guest.queue).toEqual([]); expect(guest.hasResumableSession).toBe(false);
    await guest.refresh(); expect(await guest.continueLearning()).toBe(true); expect(guest.queue[guest.index].id).toBe('account-word-a');
    harness.repo.switchUser(null); harness.auth.user = null; guest.currentUser = null; await guest.refresh();
    expect(await guest.continueLearning()).toBe(true); expect(guest.queue[guest.index].id).toBe('word-b');
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(guestBefore);
  });
  it('does not replace a newer selected session with a delayed continuation result', async () => {
    const app = useApp(); await app.refresh(); await app.start('new', ['resume-book-l-1'], 'resume-book'); await app.rate(3, 100);
    let finish!: (data: Data) => void;
    const read = vi.spyOn(harness.repo, 'read'); const saved = structuredClone(harness.repo.values.get('data_guest'));
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve as (data: Data) => void; }));
    const resuming = app.continueLearning();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    const newer = app.start('new', ['resume-book-l-2'], 'resume-book');
    finish(saved); await newer;
    expect(await resuming).toBe(false); expect(app.queue[app.index].id).toBe('word-next-lesson');
  });
  it('resumes a review session in its saved scope and skips newly ignored words without generating grades', async () => {
    const data = fixture();
    data.states = data.words.slice(0, 3).map(word => ({ ...initialState(word.id, new Date()), status: 'review' as const, reviewCount: 2, firstSeenAt: '2026-10-01T00:00:00Z', nextReviewAt: '2026-10-01T00:00:00Z' }));
    harness.repo.values.set('data_guest', data);
    const app = useApp(); await app.refresh(); await app.start('review', ['resume-book-l-1'], 'resume-book'); await app.rate(3, 500);
    await app.flag('word-b', 'isIgnored', true);
    const before = JSON.stringify(harness.repo.values.get('data_guest'));
    setActivePinia(createPinia()); const reopened = useApp(); await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true); expect(reopened.mode).toBe('review'); expect(reopened.queue[reopened.index].id).toBe('word-c'); expect(reopened.index).toBe(2);
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
  });
  it('ignores malformed or foreign-owner browser checkpoints while keeping existing progress readable', async () => {
    storageValues.set('kotobud.web.study-session.v1:data_guest', JSON.stringify({ version: 1, owner: 'data_user_other', index: -1, wordIds: ['unknown'] }));
    const before = JSON.stringify(harness.repo.values.get('data_guest'));
    const app = useApp(); await app.refresh(); expect(await app.continueLearning()).toBe(true);
    expect(app.queue[app.index].id).toBe('word-a'); expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
  });
  it('does not skip words from an old checkpoint after the user explicitly resets their learning records', async () => {
    const app = useApp(); await app.refresh(); await app.start('new', ['resume-book-l-1'], 'resume-book'); await app.rate(3, 100);
    const cleared = structuredClone(harness.repo.values.get('data_guest'))!; cleared.states = []; cleared.logs = []; harness.repo.values.set('data_guest', cleared);
    setActivePinia(createPinia()); const reopened = useApp(); await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true); expect(reopened.queue[reopened.index].id).toBe('word-a');
  });
  it('keeps the previous session when starting a deleted or unavailable book fails', async () => {
    const app = useApp(); await app.refresh(); await app.start('new', ['resume-book-l-1'], 'resume-book'); await app.rate(3, 100);
    const checkpoint = storageValues.get('kotobud.web.study-session.v1:data_guest');
    const before = JSON.stringify(harness.repo.values.get('data_guest'));
    expect(await app.start('new', ['missing-lesson'], 'missing-book')).toBe(false);
    expect(app.queue[app.index].id).toBe('word-b'); expect(storageValues.get('kotobud.web.study-session.v1:data_guest')).toBe(checkpoint);
    expect(JSON.stringify(harness.repo.values.get('data_guest'))).toBe(before);
  });
});

describe('Personal vocabulary editing through the existing repository',()=>{
  it('fills an empty personal book, creates a lesson and keeps duplicate readings distinct',async()=>{
    const data=fixture();data.lessons=[];data.words=[];
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();
    const result=await app.addPersonalWords('resume-book',[
      {term:'生',reading:'なま',meaning:'生的'},
      {term:'生',reading:'せい',meaning:'生命'},
      {term:'生',reading:'ナマ',meaning:'生的'},
    ],{lessonTitle:'通勤路上'});
    expect(result).toMatchObject({added:2,skipped:1});
    expect(app.data.lessons).toHaveLength(1);expect(app.data.lessons[0].title).toBe('通勤路上');
    expect(app.data.words.map(word=>word.reading)).toEqual(['なま','せい']);
    expect(new Set(app.data.words.map(word=>word.id)).size).toBe(2);
    expect(app.data.logs).toHaveLength(0);
    const repeated=await app.addPersonalWords('resume-book',[{term:'生',reading:'なま',meaning:'新释义'}],{lessonId:result!.lessonId});
    expect(repeated).toMatchObject({added:0,skipped:1});
    expect(app.data.words[0].meaning).toBe('生的');
  });

  it('edits a learned word without replacing its ID, review history or continuation position',async()=>{
    const data=fixture();data.words[0].rawTerm='旧词形';data.words[0].audioTerm='旧发音键';
    data.words[0].senses=[{meaning:'旧释义'},{meaning:'第二义项'}];
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();await app.start('new',['resume-book-l-1'],'resume-book');await app.rate(3,100);
    const before=structuredClone(harness.repo.values.get('data_guest'))!;
    const checkpoint=storageValues.get('kotobud.web.study-session.v1:data_guest');
    expect(await app.editPersonalWord('word-a',{term:'言葉',reading:'コトバ',meaning:'词语、表达'})).toBe(true);
    const edited=app.data.words.find(word=>word.id==='word-a')!;
    expect(edited.meaning).toBe('词语、表达');expect(edited.senses?.map(sense=>sense.meaning)).toEqual(['词语、表达','第二义项']);
    expect(app.data.states).toEqual(before.states);expect(app.data.logs).toEqual(before.logs);
    expect(app.index).toBe(1);expect(app.queue[0].id).toBe('word-a');expect(app.queue[0].rawTerm).toBeUndefined();
    expect(storageValues.get('kotobud.web.study-session.v1:data_guest')).toBe(checkpoint);
  });

  it('leaves the complete book unchanged when one pasted word is incomplete',async()=>{
    const data=fixture();data.lessons=[];data.words=[];
    harness.repo.values.set('data_guest',data);
    const app=useApp();await app.refresh();const before=structuredClone(harness.repo.values.get('data_guest'))!;
    expect(await app.addPersonalWords('resume-book',[{term:'花',reading:'はな',meaning:'花'},{term:'雨',reading:'',meaning:'雨'}],{lessonTitle:'新课'})).toBeUndefined();
    expect(harness.repo.values.get('data_guest')).toEqual(before);
    expect(app.error).toBeTruthy();
  });
});

function roundFixture(count = 23): Data {
  const data = fixture();
  data.words = Array.from({ length: count }, (_, index) => ({
    id: 'round-word-'+index, lessonId: 'resume-book-l-1', term: '言葉'+index,
    reading: 'ことば', meaning: '测试词', order: index+1,
  }));
  return data;
}

describe('Uncapped study sessions and daily plans', () => {
  it('continues a manually selected 23-word session beyond ten grades', async () => {
    harness.repo.values.set('data_guest', roundFixture());
    const app = useApp(); await app.refresh(); await app.start('new', ['resume-book-l-1'], 'resume-book');
    expect(app.sessionSize).toBe(23); expect(app.sessionRoundEnd).toBe(23);
    for (let index = 0; index < 11; index++) await app.rate(3, 100);
    expect(app.data.logs).toHaveLength(11); expect(app.index).toBe(11);
    expect(app.queue[app.index].id).toBe('round-word-11');
  });

  it('starts the 12-word half-lesson plan and resumes after a grade without duplicating it', async () => {
    const data = roundFixture();
    harness.repo.values.set('data_guest', data);
    const preference = useStudyPlanPreference(); preference.setPace('resume-book', 0.5);
    const plan = dailyStudyPlan(data, 'resume-book', preference.getPace('resume-book'), new Date('2026-10-08T12:00:00Z'));
    expect(plan.target).toBe(12); expect(plan.remaining).toBe(12); expect(plan.pendingWordIds).toHaveLength(12);

    const app = useApp(); await app.refresh();
    expect(await app.startDailyLearning('resume-book')).toBe(true);
    expect(app.queue).toHaveLength(12); expect(app.sessionSize).toBe(12);
    await app.rate(3, 500);
    expect(app.data.logs).toHaveLength(1);
    const savedLogs = JSON.stringify(app.data.logs);

    setActivePinia(createPinia()); const reopened = useApp(); await reopened.refresh();
    expect(await reopened.continueLearning()).toBe(true);
    expect(reopened.queue).toHaveLength(12); expect(reopened.index).toBe(1);
    expect(reopened.queue[reopened.index].id).toBe('round-word-1');
    expect(JSON.stringify(reopened.data.logs)).toBe(savedLogs);
  });
});
