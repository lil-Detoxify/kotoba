<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
</script>
<template>
  <header class="study-heading"><p class="eyebrow">KOTOBUD / 基础学习</p><h1>从声音，到句子。</h1><p class="muted">先熟悉五十音，再跟着自己的教材学习语法。</p></header>
  <div class="study-entry-list">
    <RouterLink to="/kana"><div><h2>五十音</h2><p>平假名与片假名 · 发音、笔顺与记忆提示</p></div><ArrowRight :size="20" aria-hidden="true" /></RouterLink>
    <RouterLink to="/books/biaori-beginner-upper"><div><h2>标日初级上 · 语法</h2><p>第 1–24 课</p></div><ArrowRight :size="20" aria-hidden="true" /></RouterLink>
    <RouterLink to="/books/biaori-beginner-lower"><div><h2>标日初级下 · 语法</h2><p>第 25–48 课</p></div><ArrowRight :size="20" aria-hidden="true" /></RouterLink>
  </div>
  <p class="study-storage-note">语法进度保存在这台设备的扩展中，按账号与词书区分。</p>
</template>
