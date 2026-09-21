<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { defaultRepository } from "../../adapters";
import type { Book, Lesson, Word } from "@jp/models";
import seedData from "../../seed.json";

const books = ref<Book[]>([]);
const lessons = ref<Lesson[]>([]);
const words = ref<Word[]>([]);
const selectedBookId = ref<string>("");

async function loadBooks() {
  let data = await defaultRepository.read();
  if (!data.books || data.books.length === 0) {
    data = await defaultRepository.transact((d) => {
      d.books = seedData.books as any;
      d.lessons = seedData.lessons as any;
      d.words = seedData.words as any;
      d.currentBookId = seedData.books[0]?.id;
      d.seeded = true;
    });
  }

  books.value = data.books;
  lessons.value = data.lessons;
  words.value = data.words;
  selectedBookId.value = data.currentBookId || data.books[0]?.id || "";
}

function selectLesson(lesson: Lesson) {
  uni.navigateTo({
    url: `/pages/study/study?lessonId=${encodeURIComponent(lesson.id)}`
  });
}

function getLessonWordCount(lessonId: string): number {
  return words.value.filter((w) => w.lessonId === lessonId).length;
}

onShow(() => {
  loadBooks();
});
</script>

<template>
  <view class="container">
    <view class="section-header">
      <text class="section-title">我的词书</text>
      <text class="section-desc">自由选择课次，随时开始学习</text>
    </view>

    <view v-for="book in books" :key="book.id" class="card book-item">
      <view class="book-header">
        <view class="book-badge">
          <text class="badge-text">日语</text>
        </view>
        <view class="book-meta">
          <text class="title">{{ book.title }}</text>
          <text class="desc">{{ book.description }}</text>
        </view>
      </view>

      <view class="lesson-list">
        <view
          v-for="l in lessons.filter((x) => x.bookId === book.id)"
          :key="l.id"
          class="lesson-item"
          @tap="selectLesson(l)"
        >
          <view class="lesson-left">
            <text class="lesson-order">第 {{ l.order }} 课</text>
            <text class="lesson-title">{{ l.title }}</text>
          </view>
          <view class="lesson-right">
            <text class="lesson-count">{{ getLessonWordCount(l.id) }} 词</text>
            <text class="arrow">›</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.section-header {
  margin-bottom: 24rpx;
}
.section-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 6rpx;
}
.section-desc {
  font-size: 26rpx;
  color: #6B7280;
}
.book-item {
  margin-bottom: 32rpx;
}
.book-header {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid #F3F4F6;
}
.book-badge {
  background: #D9532F;
  color: #FFFFFF;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  margin-right: 20rpx;
}
.badge-text {
  font-size: 24rpx;
  font-weight: 700;
}
.book-meta {
  flex: 1;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #111827;
}
.desc {
  font-size: 24rpx;
  color: #6B7280;
}
.lesson-list {
  display: flex;
  flex-direction: column;
}
.lesson-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F9FAFB;
}
.lesson-item:last-child {
  border-bottom: none;
}
.lesson-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.lesson-order {
  font-size: 24rpx;
  color: #D9532F;
  font-weight: 600;
}
.lesson-title {
  font-size: 28rpx;
  color: #1F2937;
}
.lesson-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.lesson-count {
  font-size: 24rpx;
  color: #9CA3AF;
}
.arrow {
  font-size: 32rpx;
  color: #D1D5DB;
}
</style>
