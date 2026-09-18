<script setup lang="ts">
import { ref } from 'vue';
import { useApp } from '../store';
import { GitMerge, RefreshCw, X, AlertTriangle, ShieldCheck } from 'lucide-vue-next';

const emit = defineEmits<{ (e: 'close'): void }>();
const app = useApp();

const merging = ref(false);
const errorMessage = ref('');

async function handleMerge() {
  if (merging.value) return;
  merging.value = true;
  errorMessage.value = '';
  try {
    await app.resolveConflictAndMerge();
    emit('close');
  } catch (err: any) {
    errorMessage.value = err.message || '合并失败，请稍后重试';
  } finally {
    merging.value = false;
  }
}

function handleDismiss() {
  app.showConflictModal = false;
  emit('close');
}
</script>

<template>
  <div class="modal-backdrop" @click.self="handleDismiss">
    <div class="conflict-modal" role="dialog" aria-modal="true">
      <header class="modal-header">
        <div class="title-group">
          <div class="badge-row">
            <span class="badge warning">数据合并提示</span>
          </div>
          <h2>检测到两端学习记录</h2>
        </div>
        <button class="close-btn" @click="handleDismiss" aria-label="关闭">
          <X :size="20" />
        </button>
      </header>

      <div class="modal-body">
        <div class="notice-box">
          <AlertTriangle :size="22" class="warning-icon" />
          <p>
            检测到本机和云端均有学习记录。合并后会保留两端学习进度，根据最新复习记录与标星状态智能重放，<strong>绝不会删除任何已有记录</strong>。
          </p>
        </div>

        <div class="details-list">
          <div class="detail-item">
            <ShieldCheck :size="18" class="check-icon" />
            <span>复习事件全部保留并按时间戳顺序重新计算 FSRS 记忆周期</span>
          </div>
          <div class="detail-item">
            <ShieldCheck :size="18" class="check-icon" />
            <span>生词标星与忽略状态按各字段最新时间戳合并</span>
          </div>
          <div class="detail-item">
            <ShieldCheck :size="18" class="check-icon" />
            <span>合并前已对本机记录生成安全快照，随时可回溯</span>
          </div>
        </div>

        <div v-if="errorMessage" class="error-msg" role="alert">
          {{ errorMessage }}
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="merge-btn"
          :disabled="merging"
          @click="handleMerge"
        >
          <RefreshCw v-if="merging" :size="16" class="spin" />
          <GitMerge v-else :size="16" />
          <span>{{ merging ? '正在智能合并中…' : '立即合并两端记录' }}</span>
        </button>
        <button
          type="button"
          class="cancel-btn"
          :disabled="merging"
          @click="handleDismiss"
        >
          暂不合并（仅使用云端数据）
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(24, 30, 26, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.conflict-modal {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(54, 93, 73, 0.15);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.title-group h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #24342b;
  margin: 4px 0 0;
}

.badge {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-block;
}

.badge.warning {
  color: #92580a;
  background: #fdf5e6;
  border: 1px solid #f9dfb2;
}

.close-btn {
  background: none;
  border: none;
  color: #7b8880;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  transition: all 0.15s;
}

.close-btn:hover {
  background: #f1f4f2;
  color: #24342b;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.notice-box {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #fbf8f2;
  border: 1px solid #fae6c6;
  border-radius: 10px;
  padding: 14px;
}

.notice-box p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.55;
  color: #5d4521;
}

.warning-icon {
  color: #c47c17;
  flex-shrink: 0;
  margin-top: 1px;
}

.details-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 2px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.84rem;
  color: #4b5d53;
}

.check-icon {
  color: #365d49;
  flex-shrink: 0;
}

.error-msg {
  font-size: 0.82rem;
  color: #b33927;
  background: #fdf2f0;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #f6cfc9;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.merge-btn {
  width: 100%;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #ffffff;
  background: #365d49;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.merge-btn:hover:not(:disabled) {
  background: #2b4b3b;
}

.merge-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  width: 100%;
  padding: 10px;
  font-size: 0.85rem;
  color: #6a7b72;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
}

.cancel-btn:hover:not(:disabled) {
  color: #24342b;
  text-decoration: underline;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
