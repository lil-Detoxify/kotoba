<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, BookOpen, MapPin, Search, ShoppingBag, Utensils } from 'lucide-vue-next';
import type { LearningStartPath } from '../services/learning-start';
import { firstLessonTarget, LEARNING_START_PATHS, recommendedStartBooks, useLearningStartPreference } from '../services/learning-start';
import { useStudyPlanPreference, type DailyPace } from '../services/study-plan-preference';
import { learningScenes, type LearningScene } from '../services/learning-scenes';
import { useApp } from '../store';
import BookCover from '../components/BookCover.vue';

const app = useApp();
const router = useRouter();
const preference = useLearningStartPreference();
const studyPlan = useStudyPlanPreference();
const accountId = computed(() => app.currentUser?.id ?? 'local');
const path = ref<LearningStartPath>('textbook');
const selectedBookId = ref('');
const pace = ref<DailyPace>(1);
const starting = ref(false);
const continuing = ref(false);
const error = ref('');
const continueError = ref('');
let revision = 0;

const books = computed(() => recommendedStartBooks(path.value, app.metaBooks));
const selectedBook = computed(() => books.value.find(book => book.id === selectedBookId.value));
const isJlpt = computed(() => path.value === 'jlpt');
const lessonUnit = computed(() => isJlpt.value ? '组' : '课');
const firstTarget = computed(() => firstLessonTarget(selectedBook.value, pace.value));
const bookHasProgress = computed(() => {
  const book = selectedBook.value;
  if (!book) return false;
  const lessonIds = new Set([...(book.lessons ?? []).map(lesson => lesson.id), ...app.data.lessons.filter(lesson => lesson.bookId === book.id).map(lesson => lesson.id)]);
  return app.data.states.some(state => (state.bookId === book.id || lessonIds.has(state.lessonId ?? '') || state.wordId.startsWith(`${book.id}-w-`))
    && (!!state.firstSeenAt || state.reviewCount > 0));
});
const hasCheckpoint = computed(() => app.hasResumableSession);

function resetSelection() {
  const first = books.value[0];
  selectedBookId.value = first?.id ?? '';
  pace.value = first ? studyPlan.getPace(first.id) : 1;
  error.value = '';
  continueError.value = '';
}

watch(path, resetSelection, { immediate: true });
watch(accountId, () => {
  revision += 1;
  path.value = 'textbook';
  resetSelection();
  starting.value = false;
  continuing.value = false;
}, { flush: 'sync' });

function selectBook(bookId: string) {
  selectedBookId.value = bookId;
  pace.value = studyPlan.getPace(bookId);
  error.value = '';
}

function dismissAndGo(to = '/') {
  preference.dismiss(accountId.value);
  void router.push(to);
}

async function startToday() {
  const book = selectedBook.value;
  if (!book || starting.value || app.busy) return;
  const currentRevision = revision;
  const owner = accountId.value;
  starting.value = true;
  error.value = '';
  studyPlan.setPace(book.id, pace.value);
  try {
    const started = await app.startDailyLearning(book.id);
    if (currentRevision !== revision || owner !== accountId.value) return;
    if (!started) {
      error.value = app.error || '今天的新词计划已完成，可以先看课次或选择其他词书。';
      return;
    }
    preference.dismiss(owner);
    await router.push('/study');
  } catch (cause) {
    if (currentRevision === revision && owner === accountId.value) {
      error.value = cause instanceof Error ? cause.message : '暂时无法开始今天的学习，请重试。';
    }
  } finally {
    if (currentRevision === revision && owner === accountId.value) starting.value = false;
  }
}

async function continueOriginal() {
  if (continuing.value || app.busy || !hasCheckpoint.value) return;
  const currentRevision = revision;
  const owner = accountId.value;
  continuing.value = true;
  continueError.value = '';
  try {
    const continued = await app.continueLearning();
    if (currentRevision !== revision || owner !== accountId.value) return;
    if (!continued) {
      continueError.value = app.error || '暂时无法继续原来的学习，请重试。';
      return;
    }
    preference.dismiss(owner);
    await router.push('/study');
  } catch (cause) {
    if (currentRevision === revision && owner === accountId.value) {
      continueError.value = cause instanceof Error ? cause.message : '暂时无法继续原来的学习，请重试。';
    }
  } finally {
    if (currentRevision === revision && owner === accountId.value) continuing.value = false;
  }
}

function sceneIcon(scene: LearningScene) {
  return scene.icon === 'shopping' ? ShoppingBag : scene.icon === 'dining' ? Utensils : MapPin;
}

onUnmounted(() => { revision += 1; });
</script>

<template>
  <RouterLink to="/" class="start-back"><ArrowLeft :size="16" aria-hidden="true"/>回到首页</RouterLink>
  <section class="start-heading">
    <div><p class="eyebrow">YOUR NEXT LITTLE STEP</p><h1>从哪里开始学？</h1><p class="muted">挑一个感兴趣的方向，按自己的节奏开始。</p></div>
    <button class="skip-button" type="button" @click="dismissAndGo()">先这样学 <ArrowRight :size="15" aria-hidden="true"/></button>
  </section>

  <section v-if="hasCheckpoint" class="checkpoint-note" aria-label="继续尚未完成的学习">
    <div><BookOpen :size="18" aria-hidden="true"/><span>还有一轮学习尚未完成，你可以先继续原来的学习。</span></div>
    <button type="button" :disabled="continuing || app.busy" @click="continueOriginal">{{ continuing ? '正在继续…' : '继续原来的学习' }} <ArrowRight :size="15" aria-hidden="true"/></button>
  </section>
  <p v-if="continueError" class="start-error" role="alert">{{ continueError }}</p>

  <div class="path-options" role="group" aria-label="选择学习方向">
    <button v-for="option in LEARNING_START_PATHS" :key="option.id" type="button" :aria-pressed="path === option.id" :class="{ active: path === option.id }" @click="path = option.id">
      <strong>{{ option.title }}</strong><span>{{ option.description }}</span>
    </button>
  </div>

  <section v-if="path === 'everyday'" class="everyday-panel">
    <div class="section-title"><div><h2>从一个场景开始</h2><p>已有的生活专题，直接带你进入日语对话和例句。</p></div><RouterLink to="/scenes" @click="preference.dismiss(accountId)">查看全部 <ArrowRight :size="15" aria-hidden="true"/></RouterLink></div>
    <div class="everyday-scenes">
      <RouterLink v-for="scene in learningScenes" :key="scene.id" :to="`/scenes/${scene.id}`" class="everyday-scene" @click="preference.dismiss(accountId)">
        <span class="everyday-icon"><component :is="sceneIcon(scene)" :size="20" aria-hidden="true"/></span>
        <span><strong>{{ scene.title }}</strong><small>{{ scene.description }}</small></span>
        <ArrowRight :size="16" aria-hidden="true"/>
      </RouterLink>
    </div>
    <RouterLink class="search-start-link" to="/search" @click="preference.dismiss(accountId)"><Search :size="18" aria-hidden="true"/><span><strong>自己找一个词</strong><small>查词后可以收藏原句，留给以后复习。</small></span><ArrowRight :size="16" aria-hidden="true"/></RouterLink>
  </section>

  <section v-else class="book-choice-panel" aria-labelledby="book-choice-heading">
    <div class="section-title"><div><h2 id="book-choice-heading">{{ path === 'jlpt' ? '选择备考级别' : '选择一本教材' }}</h2><p>{{ path === 'jlpt' ? '从适合当前计划的级别开始，之后也可以随时调整。' : '按教材课次稳稳地向前，也可以自由选课。' }}</p></div></div>
    <div v-if="!books.length" class="empty">暂时没有可选的内置词书。</div>
    <div v-else class="start-book-grid">
      <button v-for="book in books" :key="book.id" type="button" class="start-book-option" :class="{ selected: selectedBookId === book.id }" :aria-pressed="selectedBookId === book.id" @click="selectBook(book.id)">
        <span class="start-book-cover"><BookCover :book="book" :content="book.description"/></span>
        <span class="start-book-copy"><strong>{{ book.title }}</strong><small>{{ book.lessons.length }} {{ path === 'jlpt' ? '组' : '课' }} · {{ book.wordCount.toLocaleString() }} 词</small><span class="book-select-mark" aria-hidden="true">{{ selectedBookId === book.id ? '已选择' : '选择这本' }}</span></span>
      </button>
    </div>

    <div v-if="selectedBook" class="start-plan">
      <div class="plan-info">
        <strong>{{ bookHasProgress ? '按这本词书的今日计划继续' : `首${lessonUnit}预览` }}</strong>
        <small v-if="bookHasProgress">这本词书已有学习记录，开始后会接续它的每日计划。</small>
        <small v-else>{{ firstTarget ? `首${lessonUnit}按这个节奏约 ${firstTarget} 词。` : '选择每日节奏，开始今天的学习。' }}之后随实际课次安排。</small>
      </div>
      <label class="pace-select">每日节奏<select v-model.number="pace"><option :value="0.5">半{{ lessonUnit }} / 天</option><option :value="1">1 {{ lessonUnit }} / 天</option></select></label>
      <div class="plan-actions">
        <RouterLink class="button" :to="`/books/${selectedBook.id}`">先看课次 <ArrowRight :size="15" aria-hidden="true"/></RouterLink>
        <button class="primary" type="button" :disabled="starting || app.busy || !app.ready" :aria-busy="starting" @click="startToday">{{ starting ? '正在准备…' : '开始今天的学习' }} <ArrowRight :size="17" aria-hidden="true"/></button>
      </div>
      <p v-if="error" class="start-error" role="alert">{{ error }}</p>
    </div>
  </section>

  <p class="start-footnote">词书和场景都可以之后再换；学习记录会照常保留。</p>
</template>

<style scoped>
.start-back{display:inline-flex;align-items:center;gap:7px;min-height:44px;margin-bottom:16px;color:var(--muted);font-size:13px}.start-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:24px}.start-heading h1{margin-bottom:7px}.start-heading .muted{margin:0}.skip-button{min-height:44px;background:transparent;color:#53694f;border-color:#dfe5db}.checkpoint-note{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 18px;padding:14px 17px;border:1px solid #d9e4d3;border-radius:11px;background:#f0f4ec}.checkpoint-note>div{display:flex;align-items:center;gap:10px;color:#49614a;font-size:13px;line-height:1.6}.checkpoint-note button{min-width:176px;min-height:44px;font-size:12px}.path-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 20px}.path-options button{min-width:0;min-height:104px;align-items:flex-start;flex-direction:column;justify-content:flex-start;gap:7px;padding:17px 18px;text-align:left;background:#fffefb}.path-options button.active{border-color:#90a985;background:#edf3e8;color:#304d38;box-shadow:inset 0 0 0 1px #90a985}.path-options strong{font-size:15px}.path-options span{color:var(--muted);font-size:11px;line-height:1.65}.book-choice-panel,.everyday-panel{padding:22px;background:#fffefb;border:1px solid var(--line);border-radius:13px;min-width:0}.section-title{align-items:flex-start}.section-title h2{margin:0 0 5px}.section-title p{margin:0;color:var(--muted);font-size:12px;line-height:1.7}.section-title>a{display:inline-flex;align-items:center;gap:4px;min-height:44px;white-space:nowrap;color:#486348;font-size:12px}.start-book-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.start-book-option{min-width:0;display:flex;align-items:center;justify-content:flex-start;gap:14px;min-height:126px;padding:13px;text-align:left;border-color:#e2e8de;background:#fbfcf8}.start-book-option:hover{border-color:#adc1a4;background:#f4f7f0}.start-book-option.selected{border-color:#6f9671;background:#eef4e9;box-shadow:inset 0 0 0 1px #6f9671}.start-book-cover{display:grid;place-items:center;flex:none;width:57px;height:75px;overflow:hidden}.start-book-cover :deep(.cover-object){width:57px;height:72px;aspect-ratio:auto;border-radius:2px 5px 5px 2px;box-shadow:2px 4px 8px #243b3f24}.start-book-cover :deep(.cover-type){padding:7px 5px 0 10px}.start-book-cover :deep(.cover-type small){font-size:4px}.start-book-cover :deep(.cover-type strong){font-size:8px;line-height:1.25;margin:3px 0}.start-book-cover :deep(.cover-type span){font-size:4px}.start-book-cover :deep(.cover-imprint){left:10px;right:4px;bottom:5px;font-size:3px}.start-book-cover :deep(.cover-imprint b){width:8px;height:8px;font-size:5px}.start-book-cover :deep(.cover-spine){width:4px}.start-book-cover :deep(.cover-pages){left:4px;bottom:2px;height:2px}.start-book-cover :deep(.cover-art){bottom:10px}.start-book-copy{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:5px}.start-book-copy strong{font-size:13px;line-height:1.6;overflow-wrap:anywhere}.start-book-copy small{color:var(--muted);font-size:10px}.book-select-mark{font-size:10px;color:#55704d}.start-plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(155px,.34fr);gap:15px 20px;align-items:center;margin-top:19px;padding:17px 18px;border-radius:10px;background:#f1f4ec}.plan-info{min-width:0}.plan-info strong{display:block;color:#38533c;font-size:14px}.plan-info small{display:block;margin-top:5px;color:#637060;font-size:11px;line-height:1.7}.pace-select{font-size:11px;color:#52634f}.pace-select select{min-height:44px;margin-top:5px;padding:8px 10px}.plan-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}.plan-actions button,.plan-actions .button{min-height:46px}.start-error{grid-column:1/-1;margin:0;padding:10px 12px;border-radius:8px;background:#fff0e9;color:#873c2c;font-size:12px;line-height:1.6}.everyday-scenes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0}.everyday-scene{min-width:0;min-height:92px;display:grid;grid-template-columns:40px minmax(0,1fr) 16px;gap:10px;align-items:center;padding:13px;border:1px solid #e1e8dd;border-radius:10px;background:#fbfcf8}.everyday-scene:hover,.search-start-link:hover{border-color:#a8bc9e;background:#f1f5ed}.everyday-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#e7efe0;color:#49644a}.everyday-scene>span:nth-child(2){min-width:0}.everyday-scene strong,.search-start-link strong{display:block;color:#3f5841;font-size:12px;line-height:1.6}.everyday-scene small,.search-start-link small{display:block;margin-top:3px;color:var(--muted);font-size:10px;line-height:1.6;overflow-wrap:anywhere}.search-start-link{min-height:68px;display:grid;grid-template-columns:24px minmax(0,1fr) 16px;gap:12px;align-items:center;padding:13px 15px;border:1px solid #e1e8dd;border-radius:10px;color:#49644a}.start-footnote{margin:14px 0;color:var(--muted);font-size:11px;line-height:1.7}
@media(max-width:900px){.start-book-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.everyday-scenes{grid-template-columns:1fr}}
@media(max-width:640px){.start-heading{align-items:flex-start;flex-direction:column;gap:12px}.skip-button{align-self:flex-start}.checkpoint-note{align-items:stretch;flex-direction:column}.checkpoint-note button{width:100%}.path-options{grid-template-columns:1fr;gap:7px}.path-options button{min-height:78px;padding:13px 15px}.book-choice-panel,.everyday-panel{padding:17px 14px}.start-book-grid{grid-template-columns:1fr}.start-book-option{min-height:102px}.start-plan{grid-template-columns:minmax(0,1fr);padding:15px}.plan-actions{grid-column:auto;display:grid;grid-template-columns:1fr}.plan-actions button,.plan-actions .button{width:100%}.everyday-scenes{grid-template-columns:1fr}.section-title{flex-direction:column}.section-title>a{align-self:flex-start}}
</style>

<style scoped>
.start-plan{grid-template-columns:minmax(0,420px) minmax(155px,245px);justify-content:start}
.plan-actions{justify-content:flex-start}
@media(max-width:640px){
  .start-plan{grid-template-columns:minmax(0,1fr)}
  .path-options{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
  .path-options button{min-height:54px;align-items:center;justify-content:center;padding:10px 7px;text-align:center}
  .path-options strong{font-size:13px;white-space:nowrap}
  .path-options span{display:none}
  .start-book-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .start-book-option{gap:8px;min-height:110px;padding:10px}
  .start-book-cover{width:42px;height:60px}
  .start-book-cover :deep(.cover-object){transform:scale(.75)}
  .start-book-copy strong{font-size:12px;line-height:1.45}
  .start-book-copy small{line-height:1.5}
}
</style>
