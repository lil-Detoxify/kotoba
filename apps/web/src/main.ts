import {createApp} from 'vue';import {createPinia} from 'pinia';import {createRouter,createWebHashHistory} from 'vue-router';
import App from './App.vue';
import Home from './pages/Home.vue';
import './style.css';
import './ui-polish.css';
import './brand.css';

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: Home },
    { path: '/start', component: () => import('./pages/Start.vue') },
    { path: '/books', component: () => import('./pages/Books.vue') },
    { path: '/scenes', component: () => import('./pages/Scenes.vue') },
    { path: '/scenes/:id', component: () => import('./pages/Scenes.vue') },
    { path: '/conjugation', component: () => import('./pages/Conjugation.vue') },
    { path: '/books/:id', component: () => import('./pages/Book.vue') },
    { path: '/import', component: () => import('./pages/Import.vue') },
    { path: '/study', component: () => import('./pages/Study.vue') },
    { path: '/difficult', component: () => import('./pages/Lists.vue') },
    { path: '/ignored', component: () => import('./pages/Lists.vue') },
    { path: '/stats', component: () => import('./pages/Stats.vue') },
    { path: '/search', component: () => import('./pages/Search.vue') },
    { path: '/settings', component: () => import('./pages/Settings.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});
const app = createApp(App);
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error Boundary]', err, info);
};
app.use(createPinia()).use(router).mount('#app');
