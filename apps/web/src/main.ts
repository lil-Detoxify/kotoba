import {createApp} from 'vue';import {createPinia} from 'pinia';import {createRouter,createWebHashHistory} from 'vue-router';
import App from './App.vue';
import Home from './pages/Home.vue';
import './style.css';

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: Home },
    { path: '/books', component: () => import('./pages/Books.vue') },
    { path: '/books/:id', component: () => import('./pages/Book.vue') },
    { path: '/import', component: () => import('./pages/Import.vue') },
    { path: '/study', component: () => import('./pages/Study.vue') },
    { path: '/difficult', component: () => import('./pages/Lists.vue') },
    { path: '/ignored', component: () => import('./pages/Lists.vue') },
    { path: '/stats', component: () => import('./pages/Stats.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});
createApp(App).use(createPinia()).use(router).mount('#app');
