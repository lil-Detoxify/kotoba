<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Plus, ArrowUpRight, ArrowRight, Leaf, PenLine } from 'lucide-vue-next';
import { gsap } from 'gsap';
import { useApp } from '../store';
import BookCover from '../components/BookCover.vue';
import { pet } from '../pet/runtime';
import { effectiveReducedMotion } from '../pet/settings';
import { bookCategory, type BookCategory } from '../services/book-presentation';
import { learningScenes } from '../services/learning-scenes';
import { conjugationVerbs } from '../services/conjugation';
const app = useApp();
const library = ref<HTMLElement>();
const category = ref<'all' | BookCategory>('all');
const categories = [
  { id: 'all', title: '全部' }, { id: 'textbook', title: '教材' },
  { id: 'jlpt', title: 'JLPT' }, { id: 'custom', title: '我的词书' },
] as const;
const filteredBooks = computed(() => app.data.books.filter(book => category.value === 'all' || bookCategory(book) === category.value));
function categoryCount(id: 'all' | BookCategory) {
  return id === 'all' ? app.data.books.length : app.data.books.filter(book => bookCategory(book) === id).length;
}
const reduced = computed(() => effectiveReducedMotion(pet.settings, pet.systemPrefersReduced));
const counts = computed(() => {
  const lessonBook = new Map(app.data.lessons.map(l => [l.id, l.bookId]));
  const out = new Map<string, { lessons: number; words: number; content: string }>();
  for (const b of app.data.books) out.set(b.id, { lessons: 0, words: app.metaBooks?.find(m => m.id === b.id)?.wordCount ?? 0, content: '' });
  for (const l of app.data.lessons) { const c = out.get(l.bookId); if (c) { c.lessons++; c.content += ' ' + l.title; } }
  const loaded = new Map<string, number>();
  for (const w of app.data.words) {
    const id = lessonBook.get(w.lessonId);
    if (id) { loaded.set(id, (loaded.get(id) ?? 0) + 1); const c = out.get(id); if (c && c.content.length < 800) c.content += ' ' + w.meaning; }
  }
  for (const [id, count] of loaded) { const c = out.get(id); if (c) c.words = count; }
  return out;
});
let media: ReturnType<typeof gsap.matchMedia> | undefined;
let feedback: ((card: HTMLElement, active: boolean) => void) | undefined;
function setupMotion() {
  media?.revert();
  feedback = undefined;
  if (!library.value || reduced.value) return;
  media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', context => {
    context.add('feedback', (card: HTMLElement, active: boolean) => {
      const book = card.querySelector('.cover-object');
      const arrow = card.querySelector('.book-entry-arrow');
      if (book) gsap.to(book, { y: active ? -8 : 0, rotation: active ? -2 : 0, scale: active ? 1.025 : 1, duration: active ? .32 : .24, ease: 'power2.out', overwrite: 'auto' });
      if (arrow) gsap.to(arrow, { x: active ? 4 : 0, duration: .24, ease: 'power2.out', overwrite: 'auto' });
    });
    feedback = context.feedback;
    return () => { feedback = undefined; };
  }, library.value);
}
function activate(event: Event) { feedback?.(event.currentTarget as HTMLElement, true); }
function pointerEnter(event: PointerEvent) { if (event.pointerType === 'mouse') activate(event); }
function deactivate(event: Event) {
  const card = event.currentTarget as HTMLElement;
  if (!card.matches(':hover') && !card.contains(document.activeElement)) feedback?.(card, false);
}
onMounted(setupMotion);
watch(reduced, setupMotion, { flush: 'post' });
onUnmounted(() => { media?.revert(); feedback = undefined; });
</script>
<template>
  <section class="page-heading"><div><p class="eyebrow">MY COLLECTION</p><h1>我的词书</h1><p class="muted">每一本词书，都是一段新的旅程。</p></div><div class="actions"><RouterLink class="button primary" to="/import">添加词书 <ArrowUpRight :size="17"/></RouterLink></div></section>
  <div class="practice-entries">
  <RouterLink class="scenes-entry" to="/scenes">
    <Leaf class="scenes-entry-icon" :size="22" aria-hidden="true" />
    <span class="scenes-entry-copy"><strong>场景学习</strong><span>购物、点餐、问路，把单词用在生活里。</span></span>
    <span class="scenes-entry-meta"><span class="scenes-entry-count">{{ learningScenes.length }}个生活场景</span><span class="scenes-entry-action">进入场景学习 <ArrowRight :size="16" /></span></span>
  </RouterLink>
  <RouterLink class="scenes-entry" to="/conjugation">
    <PenLine class="scenes-entry-icon" :size="22" aria-hidden="true"/>
    <span class="scenes-entry-copy"><strong>动词活用</strong><span>从原形出发，练习四种常用变化。</span></span>
    <span class="scenes-entry-meta"><span class="scenes-entry-count">{{ conjugationVerbs.length }}个常用动词</span><span class="scenes-entry-action">开始活用练习 <ArrowRight :size="16" aria-hidden="true"/></span></span>
  </RouterLink>
  </div>
  <div class="library-tools"><div class="book-filters" role="group" aria-label="词书分类"><button v-for="item in categories" :key="item.id" type="button" :aria-pressed="category === item.id" :class="{ active: category === item.id }" @click="category = item.id">{{ item.title }} <span>{{ categoryCount(item.id) }}</span></button></div><span class="library-count" role="status" aria-live="polite">{{ filteredBooks.length }} 本词书</span></div>
  <div ref="library" class="book-grid illustrated-library">
    <RouterLink v-for="b in filteredBooks" :key="b.id" :to="'/books/' + b.id" class="library-book" :class="{ 'current-volume': b.id === app.data.currentBookId }" @pointerenter="pointerEnter" @pointerleave="deactivate" @focus="activate" @blur="deactivate">
      <div class="book-scene"><span v-if="b.id === app.data.currentBookId" class="current-tag">正在学习</span><BookCover :book="b" :content="counts.get(b.id)?.content"/><span class="scene-caption">KOTOBUD / 日本語</span></div>
      <div class="book-description"><h3>{{ b.title }}</h3><p>{{ counts.get(b.id)?.lessons ?? 0 }} {{ bookCategory(b) === 'jlpt' ? '组' : '课' }} <span>·</span> {{ (counts.get(b.id)?.words ?? 0).toLocaleString() }} 词</p><span class="book-entry">{{ b.id === app.data.currentBookId ? '继续这段旅程' : '翻开词书' }} <ArrowRight class="book-entry-arrow" :size="16"/></span></div>
    </RouterLink>
    <RouterLink class="import-tile library-import" to="/import"><Plus :size="28"/><h3>带上你的词书</h3><p>逐词添加 · 表格粘贴 · 文件导入</p><span>让感兴趣的词，也有自己的封面</span></RouterLink>
  </div>
</template>
<style scoped>
.practice-entries{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:24px}.practice-entries .scenes-entry{margin-bottom:0;grid-template-columns:auto minmax(0,1fr);gap:8px 13px}.practice-entries .scenes-entry-meta{grid-column:2;justify-content:space-between;gap:12px;white-space:normal}
@media(max-width:1000px){.practice-entries{grid-template-columns:minmax(0,1fr);gap:12px}}
.library-tools{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:25px;flex-wrap:wrap}.book-filters{display:flex;flex-wrap:wrap;gap:8px}.book-filters button{min-height:44px;padding:9px 16px;border:1px solid #d8dece;background:transparent;border-radius:100px;font-size:13px;gap:8px}.book-filters button.active{background:#dde7d2;border-color:#aebf9d;color:#304d38}.book-filters button:focus-visible{outline:2px solid var(--green);outline-offset:3px}.book-filters button span{font-size:11px;color:#586852}.library-count{font-size:12px;color:#596754}
.scenes-entry{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;min-height:78px;margin:0 0 24px;padding:14px 20px;border:1px solid #d8e0d0;border-radius:12px;background:#eef1e8;color:#35513d;text-decoration:none;outline-offset:4px;transition:border-color .18s ease,background-color .18s ease}
.scenes-entry:focus-visible{outline:2px solid var(--green)}
.scenes-entry-icon{color:#54734d}
.scenes-entry-copy{display:grid;gap:3px;min-width:0}
.scenes-entry-copy strong{font-size:16px;line-height:1.4}
.scenes-entry-copy>span{color:#5e6b59;font-size:13px;line-height:1.5}
.scenes-entry-meta{display:flex;align-items:center;gap:20px;white-space:nowrap}
.scenes-entry-count{font-size:12px;color:#5e6b59}
.scenes-entry-action{display:inline-flex;align-items:center;gap:7px;min-height:44px;color:#36583e;font-size:13px;font-weight:600}
.scenes-entry:hover{border-color:#aebfa4;background:#e9eee2}
.illustrated-library{gap:28px 24px}.library-book{min-width:0;border-radius:12px;outline-offset:5px}.book-scene{position:relative;display:grid;place-items:center;min-height:283px;padding:28px 16px 35px;background:#eeeee7;border:1px solid #e4e6db;border-radius:12px;isolation:isolate}.book-scene::before{content:'';position:absolute;width:72%;height:65%;border-radius:50%;background:#e3e6da;z-index:-1;opacity:.65}.library-book:nth-child(3n + 2) .book-scene{background:#edf0ed}.library-book:nth-child(3n) .book-scene{background:#f1ece4}.current-volume .book-scene{border-color:#9fac93;background:#e9eddf}.current-tag{position:absolute;top:13px;left:14px;font-size:10px;color:#355b45;background:#fbfcf6;border:1px solid #c7d3bd;border-radius:100px;padding:4px 8px}.scene-caption{position:absolute;bottom:13px;font-size:8px;letter-spacing:.2em;color:#7b8272}.book-description{padding:17px 3px 0}.book-description h3{font-size:17px;line-height:1.55;margin:0;overflow-wrap:anywhere}.book-description p{font-size:12px;margin:7px 0 12px}.book-entry{display:flex;align-items:center;gap:8px;font-size:11px;color:#52664f}.library-book:hover .book-scene,.library-book:focus-visible .book-scene{border-color:#91a37e}.library-book:focus-visible{outline:2px solid var(--green)}.library-import{border-radius:12px;min-height:283px;border-color:#c4ceba;background:#f0f2e8;color:#496544}.library-import span{font-size:11px;max-width:20ch;color:#73816b;margin-top:17px}.library-import:hover{background:#e9eddf}.library-import:focus-visible{outline:2px solid var(--green);outline-offset:5px}
@media(max-width:1000px) and (min-width:761px){.illustrated-library{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.scenes-entry{grid-template-columns:auto minmax(0,1fr);gap:8px 13px;padding:14px 16px}.scenes-entry-meta{grid-column:2;justify-content:space-between;gap:12px;white-space:normal}.scenes-entry-count{font-size:11px}.scenes-entry-action{font-size:12px}.illustrated-library{grid-template-columns:1fr;gap:18px}.library-book{display:grid;grid-template-columns:146px minmax(0,1fr);gap:18px;align-items:center}.book-scene{min-height:184px;padding:12px 9px 20px;border-radius:9px}.current-tag{top:6px;left:6px;font-size:8px;padding:2px 6px;z-index:2}.scene-caption{bottom:5px;font-size:6px}.book-description{padding:0}.book-description h3{font-size:16px}.book-description p{font-size:11px;line-height:1.7}.book-entry{font-size:10px;gap:3px}.library-import{min-height:150px}.library-import span{max-width:none}.library-import p{margin:5px 0}.library-import span{margin-top:5px}}
@media(max-width:360px){.library-book{grid-template-columns:125px minmax(0,1fr);gap:12px}.book-description h3{font-size:14px}.book-scene{padding-inline:2px}}
</style>
