<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted, onErrorCaptured } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { gsap } from 'gsap';
import { useApp } from './store';
import {
  Home,
  Library,
  Bookmark,
  ChartNoAxesColumn,
  Settings2,
  Leaf,
  Cloud,
  CloudOff,
  Check,
  RefreshCw,
  AlertCircle,
  User,
  LogOut,
  ChevronDown,
  ExternalLink,
  Search
} from 'lucide-vue-next';
import LoginModal from './components/LoginModal.vue';
import SyncConflictModal from './components/SyncConflictModal.vue';
import PetDock from './components/PetDock.vue';
import BrandLogo from './components/BrandLogo.vue';

const app = useApp();
const route = useRoute();
const router = useRouter();
const globalSearchQuery = ref('');
const globalSearchNotice = ref('');
let timer: ReturnType<typeof setInterval>;
const userMenuOpen = ref(false);
const capturedError = ref<string | null>(null);
const viewStage = ref<HTMLElement | null>(null);
let viewMotion: gsap.Context | undefined;
let motionVersion = 0;
const isWindowsDesktop = computed(() => typeof window !== 'undefined' && !!(window as any).kotobudDesktop);

const isDesktopPortable = ref(false);
const shortcutCreated = ref(false);
const shortcutError = ref('');

watch(() => route.query.q, value => {
  globalSearchQuery.value = typeof value === 'string' ? value : Array.isArray(value) ? String(value[0] ?? '') : '';
  globalSearchNotice.value = '';
}, { immediate: true });

function submitGlobalSearch() {
  const query = globalSearchQuery.value.trim();
  if (query.length > 80) {
    globalSearchNotice.value = '搜索词最多 80 个字符。';
    return;
  }
  globalSearchNotice.value = '';
  void router.push(query ? { path: '/search', query: { q: query } } : { path: '/search' });
}

function clearGlobalSearch() {
  globalSearchQuery.value = '';
  globalSearchNotice.value = '';
  if (route.path === '/search') void router.push({ path: '/search' });
}

onErrorCaptured((err, instance, info) => {
  console.error('[App captured error in child view]:', err, info);
  capturedError.value = String((err as any)?.message || err);
  return false;
});

function handleRetryView() {
  capturedError.value = null;
  app.refresh();
}

async function handleCreateDesktopShortcut() {
  if (typeof window !== 'undefined' && (window as any).kotobudDesktop?.createDesktopShortcut) {
    shortcutError.value = '';
    try {
      const res = await (window as any).kotobudDesktop.createDesktopShortcut();
      if (res?.success) {
        shortcutCreated.value = true;
        setTimeout(() => { shortcutCreated.value = false; }, 4000);
      } else {
        shortcutError.value = res?.error || '创建快捷方式失败';
      }
    } catch (e: any) {
      shortcutError.value = e?.message || '创建快捷方式异常';
    }
  }
}

function maskEmail(email: string) {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`;
}

function handleGlobalClick() {
  if (userMenuOpen.value) {
    userMenuOpen.value = false;
  }
}

async function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    await app.refresh();
    if (app.currentUser) {
      await app.flushSyncQueue();
    }
  }
}

function handleFocus() {
  app.refresh();
}

function focusMainContent() {
  document.getElementById('main-content')?.focus();
}

watch(() => [route.fullPath, app.ready], async () => {
  const version = ++motionVersion;
  viewMotion?.revert();
  viewMotion = undefined;
  await nextTick();
  if (version !== motionVersion || !app.ready || !viewStage.value || ['/study', '/settings'].includes(route.path) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections = Array.from(viewStage.value.children).slice(0, 2);
  if (!sections.length) return;
  viewMotion = gsap.context(() => {
    gsap.from(sections, {
      autoAlpha: 0,
      y: 8,
      duration: 0.24,
      stagger: 0.04,
      ease: 'power2.out',
      clearProps: 'all',
    });
  }, viewStage.value);
}, { flush: 'post' });

onMounted(async () => {
  app.init();
  timer = setInterval(() => {
    app.now = new Date();
  }, 30000);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('click', handleGlobalClick);

  if (typeof window !== 'undefined' && (window as any).kotobudDesktop?.isPortable) {
    try {
      isDesktopPortable.value = await (window as any).kotobudDesktop.isPortable();
    } catch {}
  }
});

onUnmounted(() => {
  viewMotion?.revert();
  clearInterval(timer);
  window.removeEventListener('focus', handleFocus);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('click', handleGlobalClick);
});

const nav = [
  { to: '/', name: '今日', icon: Home },
  { to: '/books', name: '词书', icon: Library },
  { to: '/difficult', name: '生词本', icon: Bookmark },
  { to: '/stats', name: '学习统计', icon: ChartNoAxesColumn },
  { to: '/settings', name: '设置', icon: Settings2 }
];
</script>

<template>
  <div class="shell" :class="{ 'study-mode': route.path === '/study', 'home-mode': route.path === '/' }">
    <a class="skip-link" href="#main-content" @click.prevent="focusMainContent">跳转到主要内容</a>
    <aside class="sidebar">
      <RouterLink to="/" class="brand" aria-label="Kotobud 首页">
        <BrandLogo />
      </RouterLink>
      <div class="nav-label">我的学习</div>
      <nav aria-label="主要导航">
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to">
          <component :is="item.icon" :size="19" aria-hidden="true" />
          <span>{{ item.name }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <Leaf :size="20" />
        <p v-if="app.currentUser">
          一词一句，慢慢积累。<small>已开启多端云同步</small>
        </p>
        <p v-else>
          一词一句，慢慢积累。<small>你的学习记录保存在此浏览器</small>
        </p>
        <button
          v-if="isDesktopPortable"
          type="button"
          class="portable-shortcut-btn"
          @click="handleCreateDesktopShortcut"
          :title="shortcutCreated ? '已创建桌面快捷方式' : '在桌面创建指向此便携版的快捷方式'"
        >
          <Bookmark :size="13" />
          <span>{{ shortcutCreated ? '已生成桌面快捷方式' : '创建桌面快捷方式' }}</span>
        </button>
        <a
          href="/features"
          target="_blank"
          rel="noopener"
          class="features-quiet-link"
          title="了解 Kotobud 产品功能、详细定位与更新日志"
        >
          <span>了解特性与日志</span>
          <ExternalLink :size="11" />
        </a>
      </div>
    </aside>

    <main id="main-content" tabindex="-1">
      <div class="topbar">
        <span class="topbar-kicker">日本語のある毎日</span>

        <form class="global-vocab-search" role="search" aria-label="搜索日语词汇" @submit.prevent="submitGlobalSearch">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="globalSearchQuery"
            type="search"
            maxlength="80"
            autocomplete="off"
            aria-label="日语词形、读音或中文释义"
            :aria-describedby="globalSearchNotice ? 'global-search-note' : undefined"
            placeholder="搜索词形、读音或中文…"
            @input="globalSearchNotice = ''"
          />
          <button v-if="globalSearchQuery" type="button" class="global-search-clear" aria-label="清空搜索词" @click="clearGlobalSearch">清空</button>
          <button type="submit" class="global-search-submit">搜索</button>
          <small v-if="globalSearchNotice" id="global-search-note" class="global-search-note" role="alert">{{ globalSearchNotice }}</small>
        </form>

        <div class="topbar-right">
          <!-- Unauthenticated: Login & Enable Sync button -->
          <button
            v-if="!app.currentUser"
            type="button"
            class="sync-btn-login"
            @click="app.showLoginModal = true"
          >
            <Cloud :size="15" />
            <span>登录并开启云同步</span>
          </button>

          <!-- Authenticated: Sync Status Badge + User Menu -->
          <div v-else class="auth-user-bar">
            <!-- Sync Status Badge -->
            <div class="sync-badge" :class="app.syncStatus">
              <RefreshCw v-if="app.syncStatus === 'syncing'" :size="13" class="spin" />
              <Check v-else-if="app.syncStatus === 'synced'" :size="13" />
              <CloudOff v-else-if="app.syncStatus === 'offline'" :size="13" />
              <AlertCircle v-else :size="13" />
              <span>
                {{
                  app.syncStatus === 'syncing' ? '正在同步' :
                  app.syncStatus === 'synced' ? '已同步' :
                  app.syncStatus === 'offline' ? '离线待同步' : '同步重试中'
                }}
              </span>
            </div>

            <!-- User Menu Trigger -->
            <div class="user-dropdown-container" @click.stop>
              <button
                type="button"
                class="user-btn"
                @click="userMenuOpen = !userMenuOpen"
                :aria-expanded="userMenuOpen"
              >
                <User :size="14" />
                <span class="user-email">{{ app.currentUser?.email ? maskEmail(app.currentUser.email) : '微信用户' }}</span>
                <ChevronDown :size="12" class="arrow" :class="{ open: userMenuOpen }" />
              </button>

              <!-- Dropdown Menu -->
              <div v-if="userMenuOpen" class="user-menu" @click="userMenuOpen = false">
                <div class="menu-email">{{ app.currentUser?.email || '微信用户' }}</div>
                <button v-if="isDesktopPortable" type="button" class="menu-item" @click="handleCreateDesktopShortcut">
                  <Bookmark :size="14" />
                  <span>{{ shortcutCreated ? '已生成桌面快捷方式' : '创建桌面快捷方式' }}</span>
                </button>
                <button type="button" class="menu-item" @click="app.flushSyncQueue()">
                  <RefreshCw :size="14" />
                  <span>立即同步</span>
                </button>
                <button type="button" class="menu-item logout" @click="app.logout()">
                  <LogOut :size="14" />
                  <span>退出登录</span>
                </button>
              </div>
            </div>
          </div>

          <span class="web-badge">{{ isWindowsDesktop ? 'WINDOWS' : 'WEB' }}</span>
        </div>
      </div>

      <div v-if="app.error" class="error" role="alert">
        {{ app.error }} <button @click="app.refresh">重试读取</button>
      </div>

      <div v-if="capturedError" class="view-fallback-card" role="alert">
        <AlertCircle :size="24" class="fallback-icon" />
        <div class="fallback-content">
          <h3>页面加载遇到一点问题</h3>
          <p class="muted">{{ capturedError }}</p>
          <button type="button" class="button primary retry-btn" @click="handleRetryView">
            <RefreshCw :size="15" />
            <span>重新加载视图</span>
          </button>
        </div>
      </div>
      <div v-else-if="app.ready" ref="viewStage" class="view-stage"><RouterView /></div>
      <p v-else role="status">正在整理你的词书…</p>

      <footer>
        <span>ことばを、少しずつ。</span>
        <div class="footer-links">
          <a href="/features" target="_blank" rel="noopener">特性与更新</a>
          <span class="footer-sep">·</span>
          <span>Kotobud · 日语学习手帖</span>
        </div>
      </footer>
    </main>

    <PetDock />

    <!-- Modals -->
    <LoginModal v-if="app.showLoginModal" @close="app.showLoginModal = false" />
    <SyncConflictModal v-if="app.showConflictModal" @close="app.showConflictModal = false" />
  </div>
</template>

<style scoped>
.topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
  letter-spacing: normal;
}

.sync-btn-login {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-height: 32px;
  padding: 5px 12px;
  border-radius: 6px;
  background: #edf3ee;
  border: 1px solid #c9d5ce;
  color: #365d49;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 500;
}

.sync-btn-login:hover {
  background: #dfe9e1;
  color: #243d30;
}

.auth-user-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  padding: 4px 9px;
  border-radius: 12px;
  font-weight: 500;
}

.sync-badge.synced {
  background: #edf5ee;
  color: #2c6e49;
  border: 1px solid #cce5d4;
}

.sync-badge.syncing {
  background: #f0f4fa;
  color: #29559c;
  border: 1px solid #d0deef;
}

.sync-badge.offline {
  background: #fef7ed;
  color: #b45309;
  border: 1px solid #fde0be;
}

.sync-badge.error {
  background: #fdf2f0;
  color: #b33927;
  border: 1px solid #f6cfc9;
}

.user-dropdown-container {
  position: relative;
}

.user-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 6px;
  background: #fffefb;
  border: 1px solid #dfe5db;
  color: #4b5d53;
  cursor: pointer;
  transition: background 0.15s;
}

.user-btn:hover {
  background: #f1f4f0;
}

.arrow {
  transition: transform 0.2s;
  color: #7a887f;
}

.arrow.open {
  transform: rotate(180deg);
}

.user-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #ffffff;
  border: 1px solid #dfe5db;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  min-width: 200px;
  padding: 6px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-email {
  font-size: 11px;
  color: #7b8880;
  padding: 6px 10px;
  border-bottom: 1px solid #eef2ec;
  word-break: break-all;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  border-radius: 4px;
  cursor: pointer;
  color: #37463e;
  min-height: 32px;
}

.menu-item:hover {
  background: #f3f6f1;
}

.menu-item.logout {
  color: #b33927;
}

.menu-item.logout:hover {
  background: #fdf2f0;
}

.web-badge {
  color: #8c9b7d;
  font-size: 11px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.features-quiet-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #798477;
  text-decoration: none;
  margin-top: 14px;
  transition: color 0.15s;
}

.features-quiet-link:hover {
  color: #365d49;
}

.footer-links {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.footer-links a {
  color: inherit;
  text-decoration: none;
  transition: color 0.15s;
}

.footer-links a:hover {
  color: #365d49;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.footer-sep {
  opacity: 0.6;
}

@media (max-width: 760px) {
  .sync-btn-login span {
    display: none;
  }
  .sync-btn-login {
    padding: 6px 8px;
  }
  .user-email {
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.view-fallback-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: #fdfbf7;
  border: 1px solid #e2ddd3;
  border-radius: 12px;
  padding: 24px;
  margin: 32px 0;
}
.view-fallback-card .fallback-icon {
  color: #b35900;
  flex-shrink: 0;
  margin-top: 2px;
}
.view-fallback-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
  color: #24292e;
}
.view-fallback-card .muted {
  margin: 0 0 16px;
  font-size: 13px;
  color: #6a737d;
}
.view-fallback-card .retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
}

.portable-shortcut-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  margin-top: 10px;
  font-size: 12px;
  color: #2b543d;
  background: #edf5f0;
  border: 1px solid #cce3d4;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.portable-shortcut-btn:hover {
  background: #e0eee4;
  border-color: #aed1b9;
}
</style>
