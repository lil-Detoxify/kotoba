<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, BedDouble, BookOpen, CalendarDays, CloudSun, MapPin, ShoppingBag, Utensils, Volume2 } from 'lucide-vue-next';
import { stateFor } from '@jp/core';
import { useApp } from '../store';
import { learningScenes, resolveSceneWords, sceneFor, type LearningScene, type SceneItem } from '../services/learning-scenes';
import MeaningPreview from '../components/MeaningPreview.vue';
import SceneTaskPractice from '../components/SceneTaskPractice.vue';
import { taskForScene } from '../services/scene-task';
import { usePronunciation } from '../composables/usePronunciation';
import { pet } from '../pet/runtime';

const app = useApp();
const taskRunning = ref(false);
function taskActive(active: boolean) { taskRunning.value = active; if (active) pronunciation.stop(); }
const route = useRoute();
const router = useRouter();
const pronunciation = usePronunciation();
const activeScene = computed(() => typeof route.params.id === 'string' ? sceneFor(route.params.id) : undefined);
const detail = computed(() => route.params.id !== undefined);
const loading = ref(false);
const loadError = ref('');
const starting = ref(false);
const startError = ref('');
const showTranslation = ref(false);
const readySceneId = ref<string>();
const ignoredWordIds = ref<Set<string>>(new Set());
let loadGeneration = 0;

const loadedItems = computed(() => {
  if (!activeScene.value || readySceneId.value !== activeScene.value.id) return [];
  return resolveSceneWords(activeScene.value, app.data);
});
const eligibleCount = computed(() => loadedItems.value.filter(({ word }) => !stateFor(app.data, word.id, app.currentUser?.id ?? 'local')?.isIgnored).length);
const bookTitle = (bookId: string) => app.data.books.find(book => book.id === bookId)?.title ?? '原词书';
const sceneIcons = { shopping: ShoppingBag, dining: Utensils, directions: MapPin, lodging: BedDouble, meeting: CalendarDays, weather: CloudSun };
const iconFor = (scene: LearningScene) => sceneIcons[scene.icon];
function clozePreview(item: SceneItem) { return item.example.ja.replace(item.example.cloze.answer, '＿＿'); }

async function loadScene(id: string) {
  const generation = ++loadGeneration;
  loading.value = false;
  loadError.value = '';
  startError.value = '';
  showTranslation.value = false;
  readySceneId.value = undefined;
  ignoredWordIds.value = new Set();
  const scene = sceneFor(id);
  if (!scene) return;
  const capturedUserId = app.currentUser?.id ?? null;
  const bookIds = [...new Set(scene.items.map(item => item.bookId))];
  loading.value = true;
  try {
    for (const bookId of bookIds) {
      const loaded = await app.ensureBookLoaded(bookId, false, capturedUserId);
      if (generation !== loadGeneration) return;
      if (!loaded) {
        loadError.value = app.error || `「${bookTitle(bookId)}」暂时无法读取，请重试。`;
        return;
      }
    }
    if (generation === loadGeneration) readySceneId.value = scene.id;
  } catch (error) {
    if (generation !== loadGeneration) return;
    loadError.value = error instanceof Error ? error.message : '词书暂时无法读取，请重试。';
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

watch(() => route.params.id, id => {
  pronunciation.stop();
  if (typeof id === 'string') void loadScene(id);
  else {
    loadGeneration++;
    loading.value = false;
    loadError.value = '';
    readySceneId.value = undefined;
  }
}, { immediate: true });

watch(() => app.currentUser?.id ?? null, () => {
  if (typeof route.params.id === 'string') void loadScene(route.params.id);
  else { loadGeneration++; readySceneId.value = undefined; }
});

watch(loadedItems, entries => {
  ignoredWordIds.value = new Set(entries.filter(({ word }) => stateFor(app.data, word.id, app.currentUser?.id ?? 'local')?.isIgnored).map(({ word }) => word.id));
}, { immediate: true });

async function startPractice(exercise: 'card' | 'sentence-cloze') {
  const scene = activeScene.value;
  if (!scene || starting.value || loading.value || app.busy || !eligibleCount.value) return;
  starting.value = true;
  startError.value = '';
  try {
    if (await app.startScenePractice(scene.id, exercise)) {
      if (route.params.id === scene.id) await router.push('/study');
    } else {
      startError.value = app.error || '暂时无法开始练习，请重试。';
    }
  } catch (error) {
    startError.value = error instanceof Error ? error.message : '暂时无法开始练习，请重试。';
  } finally {
    starting.value = false;
  }
}

async function speak(ja: string, reading: string) {
  await pronunciation.playSentence(ja, reading);
}

onUnmounted(() => { loadGeneration++; pronunciation.stop(); });
</script>

<template>
  <template v-if="!detail">
    <section class="page-heading scenes-heading">
      <div><p class="eyebrow">JAPANESE IN REAL LIFE</p><h1>生活场景</h1><p class="muted">从熟悉的词书出发，练习在真实情境里听懂、开口和表达。</p></div>
      <div class="scene-heading-note"><BookOpen :size="18"/><span>每个场景都沿用词条原来的词书归属</span></div>
    </section>
    <section class="scene-grid" aria-label="生活场景专题">
      <RouterLink v-for="scene in learningScenes" :key="scene.id" class="scene-card" :to="`/scenes/${scene.id}`">
        <div class="scene-card-top"><span class="scene-icon"><component :is="iconFor(scene)" :size="22"/></span><span class="scene-open">打开专题 <ArrowRight :size="15"/></span></div>
        <h2>{{ scene.title }}</h2>
        <p class="scene-description">{{ scene.description }}</p>
        <ul class="can-do-list"><li v-for="goal in scene.canDo" :key="goal">{{ goal }}</li></ul>
        <div class="scene-card-footer"><strong>{{ scene.items.length }} 个相关词</strong><span>{{ taskForScene(scene.id)?.steps.length }} 步回应 · 短对话 · 例句</span></div>
      </RouterLink>
    </section>
    <p class="scene-footnote">专题词条来自已有词书；开始练习时会保留各词原来的学习身份。</p>
  </template>

  <template v-else-if="activeScene">
    <RouterLink to="/scenes" class="back"><ArrowLeft :size="16"/>生活场景</RouterLink>
    <section class="page-heading scene-detail-heading">
      <div><p class="eyebrow">A LITTLE JAPANESE, OUT THERE</p><h1>{{ activeScene.title }}</h1><p class="muted">{{ activeScene.description }}</p></div>
      <div v-if="!taskRunning" class="scene-actions">
        <button class="primary" :disabled="loading || starting || app.busy || !eligibleCount" @click="startPractice('sentence-cloze')">例句填空 <ArrowRight :size="16"/></button>
        <button :disabled="loading || starting || app.busy || !eligibleCount" @click="startPractice('card')">先认识这些词 <BookOpen :size="16"/></button>
      </div>
    </section>

    <div class="scene-can-do"><h2>这次想练习的</h2><ul><li v-for="goal in activeScene.canDo" :key="goal">{{ goal }}</li></ul></div>

    <SceneTaskPractice :scene-id="activeScene.id" :pronunciation="pronunciation" @active="taskActive" />

    <section class="dialogue-panel">
      <div class="section-title"><div><p class="eyebrow">A SHORT CONVERSATION</p><h2>听听他们怎么说</h2></div><button class="subtle-button" :aria-pressed="showTranslation" @click="showTranslation = !showTranslation">{{ showTranslation ? '收起读音与中文' : '显示读音与中文' }}</button></div>
      <p v-if="pronunciation.sentenceError.value" class="inline-note" role="status">{{ pronunciation.sentenceError.value }}</p>
      <div class="dialogue-lines">
        <article v-for="(line, index) in activeScene.dialogue" :key="`${line.speaker}-${index}`" class="dialogue-line">
          <span class="speaker">{{ line.speaker }}</span>
          <div class="dialogue-copy"><p lang="ja" class="japanese-line">{{ line.ja }}</p><p v-if="showTranslation" class="reading-line">{{ line.reading }}</p><p v-if="showTranslation" class="translation-line">{{ line.zh }}</p><small class="sentence-audio-source">{{ pronunciation.sentenceSourceLabel(line.ja) }}</small></div>
          <button class="icon-button" type="button" :aria-label="`朗读：${line.ja}`" :disabled="pronunciation.sentenceSpeaking.value || !pronunciation.canPlaySentence(line.ja)" @click="speak(line.ja, line.reading)"><Volume2 :size="18"/></button>
        </article>
      </div>
    </section>

    <section class="scene-expressions" aria-labelledby="expressions-heading">
      <div class="section-title"><div><p class="eyebrow">USEFUL PHRASES</p><h2 id="expressions-heading">表达小贴士</h2></div></div>
      <div class="expression-list">
        <article v-for="expression in activeScene.expressions" :key="expression.ja" class="expression-note">
          <div class="expression-copy">
            <p lang="ja" class="japanese-line">{{ expression.ja }}</p>
            <p v-if="showTranslation" class="reading-line">{{ expression.reading }}</p>
            <p v-if="showTranslation" class="translation-line">{{ expression.zh }}</p>
            <p class="expression-tip">{{ expression.note }}</p>
            <small class="sentence-audio-source">{{ pronunciation.sentenceSourceLabel(expression.ja) }}</small>
          </div>
          <button class="icon-button" type="button" :aria-label="`朗读：${expression.ja}`" :disabled="pronunciation.sentenceSpeaking.value || !pronunciation.canPlaySentence(expression.ja)" @click="speak(expression.ja, expression.reading)"><Volume2 :size="18"/></button>
        </article>
      </div>
    </section>

    <section class="scene-vocabulary">
      <div class="section-title"><div><p class="eyebrow">WORDS FROM YOUR BOOKS</p><h2>本场景会遇到的词</h2></div><span class="vocab-count">{{ loading ? '正在读取…' : `${loadedItems.length} 个词` }}</span></div>
      <div v-if="loading" class="loading-panel" role="status">正在准备场景词汇…</div>
      <div v-else-if="loadError" class="error scene-error" role="alert"><p>{{ loadError }}</p><button @click="typeof route.params.id === 'string' && loadScene(route.params.id)">重试读取</button></div>
      <div v-else-if="!loadedItems.length" class="empty">这个专题暂时没有可展示的词条。</div>
      <div v-else class="scene-word-list">
        <article v-for="entry in loadedItems" :key="entry.word.id" class="scene-word">
          <div class="scene-word-main">
            <div class="word-heading"><h3 lang="ja">{{ entry.word.term }}</h3><span class="word-reading">{{ entry.word.reading }}</span><span v-if="ignoredWordIds.has(entry.word.id)" class="ignored-tag">已忽略</span></div>
            <MeaningPreview :word="entry.word" />
            <p class="word-example" lang="ja">{{ entry.item.example.ja }}</p>
            <p class="example-reading">{{ entry.item.example.reading }}</p>
            <p class="example-translation">{{ entry.item.example.zh }}</p>
            <div class="scene-example-audio"><button type="button" :disabled="pronunciation.sentenceSpeaking.value || !pronunciation.canPlaySentence(entry.item.example.ja)" @click="speak(entry.item.example.ja, entry.item.example.reading)"><Volume2 :size="15" aria-hidden="true"/>朗读例句</button><small class="sentence-audio-source">{{ pronunciation.sentenceSourceLabel(entry.item.example.ja) }}</small></div>
            <p v-if="ignoredWordIds.has(entry.word.id)" class="ignored-note">这个词在你的忽略列表中，会显示在这里，但不会进入本次练习。</p>
          </div>
          <div class="scene-word-source"><span>{{ bookTitle(entry.item.bookId) }}</span><small>词书来源</small></div>
          <div class="cloze-preview"><span>例句练习预览</span><p lang="ja">{{ clozePreview(entry.item) }}</p></div>
        </article>
      </div>
      <p v-if="!loading && !loadError && loadedItems.length" class="scene-vocab-note">这里的句子是供学习的示例。开始练习后会从场景词条和例句中抽题。</p>
    </section>

    <div v-if="startError" class="error" role="alert">{{ startError }}</div>
    <div v-if="!taskRunning" class="scene-bottom-actions" :class="{ 'with-companion': pet.settings.enabled }">
      <span>{{ eligibleCount }} 个词可进入练习 <small v-if="ignoredWordIds.size">· {{ ignoredWordIds.size }} 个已忽略</small></span>
      <div class="scene-actions"><button class="primary" :disabled="loading || starting || app.busy || !eligibleCount" @click="startPractice('sentence-cloze')">例句填空</button><button :disabled="loading || starting || app.busy || !eligibleCount" @click="startPractice('card')">先认识这些词</button></div>
    </div>
  </template>
  <div v-else class="empty">没有找到这个生活场景。<RouterLink to="/scenes">返回专题</RouterLink></div>
</template>

<style scoped>
.sentence-audio-source{display:block;color:var(--muted);font-size:10px;line-height:1.6;margin-top:7px}.scene-example-audio{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px}.scene-example-audio>button{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-size:12px;padding:7px 10px;background:transparent;border-color:var(--line)}.scene-example-audio>.sentence-audio-source{margin:0}
@media(min-width:1100px){.scene-bottom-actions.with-companion{padding-inline-end:170px;flex-wrap:wrap}}
.scenes-heading{align-items:flex-end}.scene-heading-note{display:flex;align-items:center;gap:9px;color:#64745f;font-size:12px;max-width:230px;line-height:1.7}.scene-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.scene-card{min-width:0;min-height:300px;padding:24px;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-panel);box-shadow:var(--shadow-panel);display:flex;flex-direction:column;transition:border-color .18s,background .18s}.scene-card:hover,.scene-card:focus-visible{border-color:#a9ba9a;background:#fbfcf6}.scene-card:focus-visible{outline:3px solid #b08037;outline-offset:4px}.scene-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.scene-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:13px 5px 13px 5px;background:var(--surface-soft);color:var(--green)}.scene-open{display:inline-flex;align-items:center;gap:5px;color:#677568;font-size:11px}.scene-card h2{margin:23px 0 8px;font-size:22px}.scene-description{font-size:13px;color:var(--muted);line-height:1.8;margin:0 0 12px}.can-do-list{list-style:none;margin:0;padding:0;display:grid;gap:5px;color:#4a5e4b;font-size:12px;line-height:1.7}.can-do-list li::before{content:'✓';margin-right:8px;color:#789261}.scene-card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:19px;border-top:1px solid #e8ece3;color:#63705f;font-size:11px}.scene-card-footer strong{color:#385641;font-weight:600}.scene-footnote{margin:19px 0 0;color:var(--muted);font-size:11px}.scene-detail-heading{align-items:flex-end}.scene-detail-heading h1{margin-bottom:8px}.scene-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}.scene-actions button{min-height:46px}.scene-can-do{padding:20px 23px;background:#eaf0e3;border-radius:10px;margin-bottom:27px}.scene-can-do h2{font-size:15px;margin-bottom:12px}.scene-can-do ul{display:flex;gap:8px 22px;flex-wrap:wrap;list-style:none;padding:0;margin:0}.scene-can-do li{font-size:13px;color:#465b47;line-height:1.8}.scene-can-do li::before{content:'•';color:#789261;margin-right:8px}.dialogue-panel{padding:24px;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-panel);box-shadow:var(--shadow-panel);margin-bottom:32px}.section-title{align-items:center}.section-title h2{margin:0}.section-title .eyebrow{margin-bottom:7px}.subtle-button{min-height:44px;padding:8px 13px;font-size:12px}.dialogue-lines{display:grid;gap:5px}.dialogue-line{display:grid;grid-template-columns:78px minmax(0,1fr) 44px;align-items:center;gap:14px;padding:14px 0;border-top:1px solid #edf0e9}.dialogue-line:first-child{border-top:0}.speaker{color:#6d7b69;font-size:12px}.dialogue-copy{min-width:0}.japanese-line,.reading-line,.translation-line{margin:0;overflow-wrap:anywhere;line-height:1.8}.japanese-line{font-size:18px;color:#334b3e}.reading-line{font-size:12px;color:#72806e;margin-top:3px}.translation-line{font-size:13px;color:var(--muted);margin-top:3px}.icon-button{width:44px;height:44px;padding:0;border-radius:var(--radius-control);color:var(--green)}.scene-vocabulary{margin:0 0 30px}.vocab-count{font-size:12px;color:var(--muted)}.scene-word-list{display:grid;gap:12px}.scene-word{min-width:0;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(100px,.45fr) minmax(0,1fr);gap:20px;padding:20px 22px;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-inset)}.scene-word-main{min-width:0}.word-heading{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.word-heading h3{font-size:20px;margin:0}.word-reading{font-size:12px;color:#748171}.ignored-tag{border-radius:20px;background:#f1eee7;color:#78684d;font-size:10px;padding:3px 8px}.word-example{font-size:14px;color:#405744;margin:12px 0 2px;line-height:1.8;overflow-wrap:anywhere}.example-reading,.example-translation{font-size:12px;line-height:1.75;color:#788174;margin:2px 0;overflow-wrap:anywhere}.example-translation{color:#59675b}.ignored-note{font-size:11px;line-height:1.7;color:#87734f;margin:8px 0 0}.scene-word-source{display:flex;flex-direction:column;justify-content:center;gap:5px;border-left:1px solid #edf0e9;padding-left:18px;min-width:0}.scene-word-source span{font-size:12px;color:#52634f;overflow-wrap:anywhere}.scene-word-source small{font-size:10px;color:#929a8f}.cloze-preview{min-width:0;padding:12px 14px;background:var(--surface-muted);border-radius:var(--radius-control);align-self:center}.cloze-preview>span{font-size:10px;color:#75816f}.cloze-preview p{font-size:13px;line-height:1.75;margin:6px 0;color:#415543;overflow-wrap:anywhere}.cloze-preview small{font-size:10px;color:#858e81}.scene-vocab-note{margin-top:12px;color:var(--muted);font-size:11px;line-height:1.7}.loading-panel{padding:25px;background:#f0f2eb;border-radius:10px;color:var(--muted);font-size:13px}.scene-error{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.scene-error p{margin:0}.scene-bottom-actions{position:sticky;bottom:8px;z-index:2;padding:13px 15px;margin:22px 0 4px;border:1px solid #dce4d5;border-radius:12px;background:#f7f8f4f2;backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:space-between;gap:14px}.scene-bottom-actions>span{font-size:13px;color:#52634f}.scene-bottom-actions small{font-size:11px;color:var(--muted)}
.scene-expressions{margin-bottom:32px}.expression-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.expression-note{display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:start;gap:12px;padding-top:17px;border-top:1px solid var(--line)}.expression-copy{min-width:0}.expression-tip{margin:10px 0 0;color:#5c6d59;font-size:13px;line-height:1.8;overflow-wrap:anywhere}.expression-note button:focus-visible{outline:3px solid #b08037;outline-offset:3px}
@media(max-width:640px){.expression-list{grid-template-columns:minmax(0,1fr);gap:18px}}
@media(max-width:950px){.scene-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.scene-heading-note{display:none}.scene-word{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.scene-word-source{grid-column:1/-1;grid-row:2;border:0;border-top:1px solid #edf0e9;padding:10px 0 0}.cloze-preview{grid-column:2;grid-row:1}}
@media(max-width:640px){.scenes-heading,.scene-detail-heading{align-items:stretch;flex-direction:column}.scene-grid{grid-template-columns:minmax(0,1fr);gap:12px}.scene-card{min-height:0;padding:19px}.scene-card h2{margin-top:17px}.scene-card-footer{margin-top:17px}.scene-actions{justify-content:flex-start}.scene-actions button{flex:1}.scene-can-do{padding:17px}.scene-can-do ul{display:grid;gap:6px}.dialogue-panel{padding:17px}.section-title{align-items:flex-start;flex-direction:column}.subtle-button{align-self:flex-start}.dialogue-line{grid-template-columns:54px minmax(0,1fr) 44px;gap:9px;padding:12px 0}.japanese-line{font-size:16px}.scene-word{grid-template-columns:minmax(0,1fr);gap:12px;padding:17px}.scene-word-source{grid-column:auto;grid-row:auto;border-top:1px solid #edf0e9;padding-top:10px}.cloze-preview{grid-column:auto;grid-row:auto;align-self:stretch}.scene-bottom-actions{align-items:stretch;flex-direction:column}.scene-bottom-actions .scene-actions{width:100%}}
@media(max-width:760px){.scene-bottom-actions{bottom:calc(82px + env(safe-area-inset-bottom,0px))}}
</style>
