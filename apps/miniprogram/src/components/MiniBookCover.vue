<script setup lang="ts">
import { computed } from "vue";
import type { Book } from "@jp/models";
import { bookPresentation } from "../services/book-presentation";

const props = defineProps<{ book: Pick<Book, "id" | "title" | "description"> }>();
const cover = computed(() => bookPresentation(props.book));
</script>

<template>
  <view class="book-cover" :class="[`cover-${cover.scene}`, { 'cover-exam': cover.exam }]" aria-hidden="true">
    <view class="cover-spine" />
    <view class="cover-type">
      <text class="cover-series">{{ cover.series }}</text>
      <text class="cover-volume">{{ cover.volume }}</text>
      <text class="cover-caption">{{ cover.caption }}</text>
    </view>
    <image class="cover-art" :src="`/static/covers/${cover.scene}.png`" mode="aspectFit" />
    <view class="cover-imprint"><text>日本語を、少しずつ。</text><text class="cover-mark">K</text></view>
    <view class="cover-pages" />
  </view>
</template>

<style scoped>
.book-cover { --cover-bg: #e8e9cd; --cover-ink: #324f3c; position: relative; flex: none; width: 160rpx; height: 202rpx; overflow: hidden; color: var(--cover-ink); background: var(--cover-bg); border-radius: 4rpx 12rpx 12rpx 4rpx; box-shadow: 5rpx 9rpx 0 -2rpx #c7c5b8, 12rpx 16rpx 28rpx -12rpx #243b3f40; }
.cover-train { --cover-bg: #dbe6e9; --cover-ink: #264956; }
.cover-cafe { --cover-bg: #e5dfcb; --cover-ink: #554636; }
.cover-bridge { --cover-bg: #dfdfe9; --cover-ink: #46466a; }
.cover-table { --cover-bg: #eadccc; --cover-ink: #64412f; }
.cover-museum { --cover-bg: #d9e4df; --cover-ink: #2e4e49; }
.cover-garden { --cover-bg: #e4e6d1; --cover-ink: #3d5238; }
.cover-spine { position: absolute; z-index: 2; top: 0; bottom: 0; left: 0; width: 12rpx; background: #26352c15; border-right: 1rpx solid #ffffff66; }
.cover-type { position: relative; z-index: 1; padding: 16rpx 10rpx 0 22rpx; }
.cover-series { display: block; font-size: 12rpx; line-height: 1.3; }
.cover-volume { display: block; margin: 8rpx 0 4rpx; font-family: serif; font-size: 27rpx; line-height: 1.35; font-weight: 600; overflow-wrap: anywhere; }
.cover-caption { display: block; font-size: 11rpx; line-height: 1.45; }
.cover-art { position: absolute; left: 0; bottom: 26rpx; width: 100%; height: 108rpx; }
.cover-exam .cover-volume { margin: 6rpx 0; font-family: Georgia, serif; font-size: 52rpx; line-height: 1; letter-spacing: 2rpx; }
.cover-exam .cover-caption { font-size: 10rpx; }
.cover-exam .cover-art { bottom: 30rpx; height: 86rpx; }
.cover-imprint { position: absolute; z-index: 1; right: 10rpx; bottom: 12rpx; left: 22rpx; display: flex; align-items: center; justify-content: space-between; font-size: 9rpx; }
.cover-mark { display: flex; width: 22rpx; height: 22rpx; align-items: center; justify-content: center; border: 1rpx solid currentColor; border-radius: 50%; font: 16rpx Georgia, serif; }
.cover-pages { position: absolute; right: 8rpx; bottom: 4rpx; left: 12rpx; height: 4rpx; background: #faf8ef; border-radius: 3rpx; }
@media (max-width: 360px) { .book-cover { width: 142rpx; height: 180rpx; } .cover-volume { font-size: 23rpx; } .cover-exam .cover-volume { font-size: 44rpx; } .cover-art { height: 95rpx; } }
</style>
