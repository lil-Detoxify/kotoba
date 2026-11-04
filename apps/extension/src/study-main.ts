import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import StudyApp from './study/StudyApp.vue';
import StudyHome from './study/StudyHome.vue';
import GrammarCatalog from './study/GrammarCatalog.vue';
import '../../web/src/style.css';
import './study/study.css';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/books' },
    { path: '/books', component: StudyHome },
    { path: '/books/:id', component: GrammarCatalog, meta: { grammar: true } },
    { path: '/grammar/:bookId/:order', component: () => import('./study/GrammarLesson.vue'), meta: { grammar: true } },
    { path: '/kana', component: () => import('../../web/src/pages/Kana.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/books' },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
createApp(StudyApp).use(router).mount('#app');
