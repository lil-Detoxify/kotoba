<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import { extensionApi } from '../client';

const owner = ref<string>();
const error = ref('');
let epoch = 0;
let channel: BroadcastChannel | undefined;
async function refresh(reset = false) {
  const request = ++epoch;
  if (reset) owner.value = undefined;
  error.value = '';
  try {
    const data = await extensionApi.read();
    if (request !== epoch) return;
    if (!data.identity?.partitionKey) throw new Error('暂时无法读取当前账号，请返回扩展重试。');
    owner.value = data.identity.partitionKey;
  } catch (cause) {
    if (request !== epoch) return;
    owner.value = undefined;
    error.value = cause instanceof Error ? cause.message : '暂时无法读取扩展数据。';
  }
}
function accountChanged() { void refresh(true); }
function focused() { void refresh(true); }
function visible() { if (!document.hidden) void refresh(true); }
onMounted(() => {
  void refresh();
  window.addEventListener('kotobud:account-changed', accountChanged);
  window.addEventListener('focus', focused);
  document.addEventListener('visibilitychange', visible);
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('kotobud-account');
    channel.onmessage = accountChanged;
  }
});
onUnmounted(() => {
  epoch++;
  channel?.close();
  window.removeEventListener('kotobud:account-changed', accountChanged);
  window.removeEventListener('focus', focused);
  document.removeEventListener('visibilitychange', visible);
});
</script>

<template>
  <main class="extension-study">
    <nav class="study-nav" aria-label="扩展学习导航"><a href="./learning.html"><ArrowLeft :size="16" aria-hidden="true" /> 扩展词书</a><RouterLink to="/books">基础学习</RouterLink><span>KotoBud</span></nav>
    <div v-if="error" class="study-message" role="alert"><p>{{error}}</p><button type="button" @click="refresh(true)">重新读取</button></div>
    <p v-else-if="!owner" class="study-message" role="status">正在读取本机学习进度…</p>
    <RouterView v-else v-slot="{ Component, route }"><component :is="Component" :key="owner" v-bind="route.meta.grammar ? {owner} : route.path === '/kana' ? {backLabel:'基础学习'} : {}" /></RouterView>
  </main>
</template>
