<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { gsap } from 'gsap';
import { useApp } from '../store';
import type { WechatAttempt } from '../services/wechatAuth';
import { X, Mail, Lock, ShieldCheck, RefreshCw, Eye, EyeOff, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-vue-next';

type AuthStep = 'email' | 'password' | 'register' | 'legacy_upgrade' | 'reset_password';

const emit = defineEmits<{ (e: 'close'): void }>();
const app = useApp();
// Development plan is archived. Re-enable only after an explicit product decision.
const wechatLoginAvailable = false;
const modalRoot = ref<HTMLElement | null>(null);
let modalMotion: gsap.Context | undefined;
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';

function focusFirstField() {
  modalRoot.value?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus();
}

function handleModalKeys(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || !modalRoot.value) return;
  const focusable = Array.from(modalRoot.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])'))
    .filter(element => element.getClientRects().length > 0 && element.tabIndex >= 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!modalRoot.value.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

const step = ref<AuthStep>('email');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const code = ref('');

const showPassword = ref(false);
const showConfirmPassword = ref(false);
const checkingEmail = ref(false);
const sendingCode = ref(false);
const submitting = ref(false);

const errorMessage = ref('');
const successMessage = ref('');
const wechatAttempt = ref<WechatAttempt | null>(null);
const wechatBusy = ref(false);
const wechatError = ref('');
let wechatTimer: ReturnType<typeof setTimeout> | null = null;
const cooldownSeconds = ref(0);
let cooldownTimer: any = null;

onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', handleModalKeys);
  if (modalRoot.value && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    modalMotion = gsap.context(() => {
      gsap.from('.login-modal', { autoAlpha: 0, y: 18, scale: 0.985, duration: 0.32, ease: 'power2.out', clearProps: 'opacity,visibility,transform', onComplete: focusFirstField });
    }, modalRoot.value);
  } else void nextTick(focusFirstField);
  const savedEmail = localStorage.getItem('kotobud_last_login_email');
  if (savedEmail && !email.value) {
    email.value = savedEmail;
  }

  const savedCooldown = localStorage.getItem('kotobud_otp_cooldown');
  if (savedCooldown) {
    const remaining = Math.floor((Number(savedCooldown) - Date.now()) / 1000);
    if (remaining > 0) {
      startCooldown(remaining);
    }
  }
});

watch(email, (val) => {
  if (val) {
    localStorage.setItem('kotobud_last_login_email', val.trim());
  }
});

onUnmounted(() => {
  modalMotion?.revert();
  document.removeEventListener('keydown', handleModalKeys);
  document.body.style.overflow = previousOverflow;
  previousFocus?.focus();
  if (cooldownTimer) clearInterval(cooldownTimer);
  if (wechatTimer) clearTimeout(wechatTimer);
  wechatAttempt.value = null;
});

watch(step, value => {
  void nextTick(focusFirstField);
  if (value !== 'email') {
    wechatAttempt.value = null;
    if (wechatTimer) clearTimeout(wechatTimer);
  }
});

async function startWechatLogin() {
  if (wechatBusy.value) return;
  wechatBusy.value = true;
  wechatError.value = '';
  try {
    const attempt = await app.startWechatLogin();
    wechatAttempt.value = attempt;
    scheduleWechatPoll(attempt);
  } catch (error) {
    wechatError.value = error instanceof Error ? error.message : '微信登录暂时不可用。';
  } finally { wechatBusy.value = false; }
}

function scheduleWechatPoll(attempt: WechatAttempt) {
  if (wechatTimer) clearTimeout(wechatTimer);
  wechatTimer = setTimeout(async () => {
    if (wechatAttempt.value?.attemptId !== attempt.attemptId) return;
    if (Date.now() >= Date.parse(attempt.expiresAt)) {
      wechatError.value = '二维码已过期，请重新获取。';
      wechatAttempt.value = null;
      return;
    }
    try {
      const result = await app.finishWechatLogin(attempt, () => wechatAttempt.value?.attemptId === attempt.attemptId && step.value === 'email');
      if (wechatAttempt.value?.attemptId !== attempt.attemptId) return;
      if (result.pending) scheduleWechatPoll(attempt);
      else if (result.success) emit('close');
      else wechatError.value = result.error || '微信登录失败，请重试。';
    } catch (error) {
      wechatError.value = error instanceof Error ? error.message : '微信登录失败，请重试。';
    }
  }, 2000);
}

function startCooldown(seconds: number) {
  cooldownSeconds.value = seconds;
  localStorage.setItem('kotobud_otp_cooldown', String(Date.now() + seconds * 1000));
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    cooldownSeconds.value--;
    if (cooldownSeconds.value <= 0) {
      clearInterval(cooldownTimer);
      localStorage.removeItem('kotobud_otp_cooldown');
    }
  }, 1000);
}

function resetErrors() {
  errorMessage.value = '';
  successMessage.value = '';
}

function changeEmail() {
  step.value = 'email';
  password.value = '';
  confirmPassword.value = '';
  code.value = '';
  resetErrors();
}

function switchToResetPassword() {
  step.value = 'reset_password';
  password.value = '';
  confirmPassword.value = '';
  code.value = '';
  resetErrors();
  handleSendCode();
}

function backToLogin() {
  step.value = 'password';
  password.value = '';
  confirmPassword.value = '';
  code.value = '';
  resetErrors();
}

async function handleCheckEmail() {
  if (checkingEmail.value) return;
  const cleanEmail = email.value.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    errorMessage.value = '请输入有效的邮箱地址';
    return;
  }

  checkingEmail.value = true;
  resetErrors();

  try {
    const res = await app.checkAccount(cleanEmail);
    if (res.error) {
      errorMessage.value = res.error;
      return;
    }

    if (res.flow === 'password') {
      step.value = 'password';
    } else if (res.flow === 'legacy_upgrade') {
      step.value = 'legacy_upgrade';
      handleSendCode();
    } else {
      step.value = 'register';
      handleSendCode();
    }
  } catch (err: any) {
    errorMessage.value = err.message || '网络请求异常，请稍后重试';
  } finally {
    checkingEmail.value = false;
  }
}

async function handleSendCode() {
  if (cooldownSeconds.value > 0 || sendingCode.value) return;
  const cleanEmail = email.value.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    errorMessage.value = '请输入有效的邮箱地址';
    return;
  }

  sendingCode.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const res = await app.sendEmailCode(cleanEmail);
    if (res.success) {
      successMessage.value = '验证码已发送至您的邮箱，请查收（5分钟内有效）';
      startCooldown(60);
    } else {
      errorMessage.value = res.error || '验证码发送失败，请稍后重试';
    }
  } catch (err: any) {
    errorMessage.value = err.message || '网络请求异常，请检查网络';
  } finally {
    sendingCode.value = false;
  }
}

async function handlePasswordLogin() {
  if (submitting.value) return;
  const cleanEmail = email.value.trim().toLowerCase();
  if (!cleanEmail) {
    errorMessage.value = '请输入邮箱';
    return;
  }
  if (!password.value) {
    errorMessage.value = '请输入登录密码';
    return;
  }

  submitting.value = true;
  resetErrors();

  try {
    const res = await app.loginWithPassword(cleanEmail, password.value);
    if (res.success) {
      emit('close');
    } else {
      if (res.flow === 'legacy_upgrade') {
        step.value = 'legacy_upgrade';
        errorMessage.value = res.error || '该账号尚未设置密码，请先完成安全升级';
        handleSendCode();
      } else {
        errorMessage.value = res.error || '邮箱或密码错误，请核对后重试';
      }
    }
  } catch (err: any) {
    errorMessage.value = err.message || '登录异常，请重试';
  } finally {
    submitting.value = false;
  }
}

async function handleRegister() {
  if (submitting.value) return;
  const cleanEmail = email.value.trim().toLowerCase();
  const cleanCode = code.value.trim();

  if (!cleanCode || cleanCode.length < 4) {
    errorMessage.value = '请输入正确的邮箱验证码';
    return;
  }
  if (!password.value || password.value.length < 8) {
    errorMessage.value = '请设置至少 8 位的登录密码';
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的密码不一致';
    return;
  }

  submitting.value = true;
  resetErrors();

  try {
    const res = await app.registerWithPassword(cleanEmail, password.value, cleanCode);
    if (res.success) {
      emit('close');
    } else {
      errorMessage.value = res.error || '注册失败，请检查验证码是否正确';
    }
  } catch (err: any) {
    errorMessage.value = err.message || '注册异常，请重试';
  } finally {
    submitting.value = false;
  }
}

async function handleLegacyUpgrade() {
  if (submitting.value) return;
  const cleanEmail = email.value.trim().toLowerCase();
  const cleanCode = code.value.trim();

  if (!cleanCode || cleanCode.length < 4) {
    errorMessage.value = '请输入正确的邮箱验证码';
    return;
  }
  if (!password.value || password.value.length < 8) {
    errorMessage.value = '请设置至少 8 位的登录密码';
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的密码不一致';
    return;
  }

  submitting.value = true;
  resetErrors();

  try {
    const res = await app.upgradeLegacyPassword(cleanEmail, password.value, cleanCode);
    if (res.success) {
      emit('close');
    } else {
      errorMessage.value = res.error || '升级失败，请检查验证码是否正确';
    }
  } catch (err: any) {
    errorMessage.value = err.message || '升级异常，请重试';
  } finally {
    submitting.value = false;
  }
}

async function handleResetPassword() {
  if (submitting.value) return;
  const cleanEmail = email.value.trim().toLowerCase();
  const cleanCode = code.value.trim();

  if (!cleanCode || cleanCode.length < 4) {
    errorMessage.value = '请输入正确的邮箱验证码';
    return;
  }
  if (!password.value || password.value.length < 8) {
    errorMessage.value = '请设置至少 8 位的新密码';
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的新密码不一致';
    return;
  }

  submitting.value = true;
  resetErrors();

  try {
    const res = await app.resetPassword(cleanEmail, password.value, cleanCode);
    if (res.success) {
      emit('close');
    } else {
      errorMessage.value = res.error || '重置密码失败，请核对验证码';
    }
  } catch (err: any) {
    errorMessage.value = err.message || '重置密码异常，请重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div ref="modalRoot" class="modal-backdrop" @click.self="emit('close')">
    <div class="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <header class="modal-header">
        <div class="title-group">
          <span class="badge">Cloud Sync</span>
          <h2 v-if="step === 'email'" id="login-modal-title">登录或注册 Kotobud</h2>
          <h2 v-else-if="step === 'password'" id="login-modal-title">密码登录</h2>
          <h2 v-else-if="step === 'register'" id="login-modal-title">创建新账号</h2>
          <h2 v-else-if="step === 'legacy_upgrade'" id="login-modal-title">账号安全升级</h2>
          <h2 v-else-if="step === 'reset_password'" id="login-modal-title">重置登录密码</h2>
        </div>
        <button class="close-btn" @click="emit('close')" aria-label="关闭">
          <X :size="20" />
        </button>
      </header>

      <!-- Step Descriptions -->
      <p v-if="step === 'email'" class="modal-desc">
        输入邮箱地址继续。已有密码直接登录，新用户或旧版免密用户将快速完成设置。
      </p>
      <p v-else-if="step === 'password'" class="modal-desc">
        输入登录密码，随时随地在多端同步你的日语学习进度。
      </p>
      <p v-else-if="step === 'register'" class="modal-desc">
        该邮箱尚未注册，请输入发送至邮箱的验证码并设置密码以创建账号。
      </p>
      <div v-else-if="step === 'legacy_upgrade'" class="info-banner">
        <KeyRound :size="18" class="info-icon" />
        <div>
          <strong>检测到旧版免密账号</strong>
          <p>为了账户与数据安全，请验证邮箱并设置登录密码。您的历史学习记录与词书进度将完整保留。</p>
        </div>
      </div>
      <p v-else-if="step === 'reset_password'" class="modal-desc">
        验证邮箱后设置新密码，重置成功后将撤销所有历史设备的旧登录态并自动登录。
      </p>

      <!-- Current Email Pill (when past email step) -->
      <div v-if="step !== 'email'" class="email-pill">
        <span class="email-text">{{ email }}</span>
        <button type="button" class="switch-email-btn" @click="changeEmail">
          更换
        </button>
      </div>

      <!-- Form: Step 1 Email -->
      <form v-if="step === 'email'" class="modal-form" @submit.prevent="handleCheckEmail">
        <div class="field">
          <label for="login-email">邮箱地址</label>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Mail :size="18" />
            </span>
            <input
              id="login-email"
              v-model="email"
              type="email"
              class="modal-input"
              placeholder="your-name@example.com"
              required
              autofocus
              autocomplete="email"
            />
          </div>
        </div>

        <div v-if="errorMessage" class="error-msg" role="alert">
          {{ errorMessage }}
        </div>

        <div class="actions">
          <button type="submit" class="submit-btn" :disabled="checkingEmail || !email.trim()">
            <RefreshCw v-if="checkingEmail" :size="16" class="spin" />
            <span v-else>继续</span>
          </button>
        </div>
      </form>

      <div v-if="step === 'email' && wechatLoginAvailable" class="wechat-login-option">
        <button type="button" class="wechat-action" :disabled="wechatBusy" @click="startWechatLogin">{{ wechatBusy ? '正在准备…' : '微信扫码登录' }}</button>
        <template v-if="wechatAttempt">
          <a class="wechat-open" :href="wechatAttempt.authorizeUrl" target="_blank" rel="noopener noreferrer">打开微信扫码页</a>
          <p>扫码确认后返回这里，登录将自动完成。已有邮箱学习记录请先用邮箱登录并绑定微信。</p>
        </template>
        <p v-if="wechatError" role="alert" class="error-msg">{{ wechatError }}</p>
      </div>

      <!-- Form: Flow A Password Login -->
      <form v-else-if="step === 'password'" class="modal-form" @submit.prevent="handlePasswordLogin">
        <div class="field">
          <div class="label-row">
            <label for="login-password">登录密码</label>
            <button type="button" class="text-link" @click="switchToResetPassword">
              忘记密码？
            </button>
          </div>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Lock :size="18" />
            </span>
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="modal-input"
              placeholder="输入您的登录密码"
              required
              autofocus
              autocomplete="current-password"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="error-msg" role="alert">
          {{ errorMessage }}
        </div>

        <div class="actions">
          <button type="submit" class="submit-btn" :disabled="submitting || !password">
            <RefreshCw v-if="submitting" :size="16" class="spin" />
            <span v-else>登录并开启云同步</span>
          </button>
        </div>
      </form>

      <!-- Form: Flow B Register -->
      <form v-else-if="step === 'register'" class="modal-form" @submit.prevent="handleRegister">
        <div class="field">
          <label for="reg-code">6 位邮箱验证码</label>
          <div class="code-row">
            <div class="input-wrap code-input">
              <span class="icon-slot" aria-hidden="true">
                <ShieldCheck :size="18" />
              </span>
              <input
                id="reg-code"
                v-model="code"
                type="text"
                maxlength="6"
                class="modal-input"
                placeholder="输入验证码"
                required
                autocomplete="one-time-code"
              />
            </div>
            <button
              type="button"
              class="send-btn"
              :disabled="cooldownSeconds > 0 || sendingCode"
              @click="handleSendCode"
            >
              <RefreshCw v-if="sendingCode" :size="14" class="spin" />
              <span v-else-if="cooldownSeconds > 0">{{ cooldownSeconds }}s 后重发</span>
              <span v-else>获取验证码</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label for="reg-password">设置密码（至少 8 位）</label>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Lock :size="18" />
            </span>
            <input
              id="reg-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="modal-input"
              placeholder="至少 8 位密码"
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              tabindex="-1"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <div class="field">
          <label for="reg-confirm-password">确认密码</label>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Lock :size="18" />
            </span>
            <input
              id="reg-confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              class="modal-input"
              placeholder="再次输入密码"
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              tabindex="-1"
              :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <EyeOff v-if="showConfirmPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="error-msg" role="alert">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="success-msg" role="status">
          {{ successMessage }}
        </div>

        <div class="actions">
          <button type="submit" class="submit-btn" :disabled="submitting || !code.trim() || password.length < 8 || password !== confirmPassword">
            <RefreshCw v-if="submitting" :size="16" class="spin" />
            <span v-else>注册并自动登录</span>
          </button>
        </div>
      </form>

      <!-- Form: Flow C Legacy Account Upgrade -->
      <form v-else-if="step === 'legacy_upgrade'" class="modal-form" @submit.prevent="handleLegacyUpgrade">
        <div class="field">
          <label for="up-code">6 位邮箱验证码</label>
          <div class="code-row">
            <div class="input-wrap code-input">
              <span class="icon-slot" aria-hidden="true">
                <ShieldCheck :size="18" />
              </span>
              <input
                id="up-code"
                v-model="code"
                type="text"
                maxlength="6"
                class="modal-input"
                placeholder="输入验证码"
                required
                autocomplete="one-time-code"
              />
            </div>
            <button
              type="button"
              class="send-btn"
              :disabled="cooldownSeconds > 0 || sendingCode"
              @click="handleSendCode"
            >
              <RefreshCw v-if="sendingCode" :size="14" class="spin" />
              <span v-else-if="cooldownSeconds > 0">{{ cooldownSeconds }}s 后重发</span>
              <span v-else>获取验证码</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label for="up-password">设置初始登录密码（至少 8 位）</label>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Lock :size="18" />
            </span>
            <input
              id="up-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="modal-input"
              placeholder="至少 8 位密码"
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              tabindex="-1"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <div class="field">
          <label for="up-confirm-password">确认密码</label>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Lock :size="18" />
            </span>
            <input
              id="up-confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              class="modal-input"
              placeholder="再次输入密码"
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              tabindex="-1"
              :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <EyeOff v-if="showConfirmPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="error-msg" role="alert">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="success-msg" role="status">
          {{ successMessage }}
        </div>

        <div class="actions">
          <button type="submit" class="submit-btn" :disabled="submitting || !code.trim() || password.length < 8 || password !== confirmPassword">
            <RefreshCw v-if="submitting" :size="16" class="spin" />
            <span v-else>完成升级并登录</span>
          </button>
        </div>
      </form>

      <!-- Form: Flow D Reset Password -->
      <form v-else-if="step === 'reset_password'" class="modal-form" @submit.prevent="handleResetPassword">
        <div class="field">
          <label for="reset-code">6 位邮箱验证码</label>
          <div class="code-row">
            <div class="input-wrap code-input">
              <span class="icon-slot" aria-hidden="true">
                <ShieldCheck :size="18" />
              </span>
              <input
                id="reset-code"
                v-model="code"
                type="text"
                maxlength="6"
                class="modal-input"
                placeholder="输入验证码"
                required
                autocomplete="one-time-code"
              />
            </div>
            <button
              type="button"
              class="send-btn"
              :disabled="cooldownSeconds > 0 || sendingCode"
              @click="handleSendCode"
            >
              <RefreshCw v-if="sendingCode" :size="14" class="spin" />
              <span v-else-if="cooldownSeconds > 0">{{ cooldownSeconds }}s 后重发</span>
              <span v-else>获取验证码</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label for="reset-password">设置新密码（至少 8 位）</label>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Lock :size="18" />
            </span>
            <input
              id="reset-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="modal-input"
              placeholder="至少 8 位新密码"
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              tabindex="-1"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <div class="field">
          <label for="reset-confirm-password">确认新密码</label>
          <div class="input-wrap">
            <span class="icon-slot" aria-hidden="true">
              <Lock :size="18" />
            </span>
            <input
              id="reset-confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              class="modal-input"
              placeholder="再次输入新密码"
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              tabindex="-1"
              :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <EyeOff v-if="showConfirmPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="error-msg" role="alert">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="success-msg" role="status">
          {{ successMessage }}
        </div>

        <div class="actions">
          <button type="submit" class="submit-btn" :disabled="submitting || !code.trim() || password.length < 8 || password !== confirmPassword">
            <RefreshCw v-if="submitting" :size="16" class="spin" />
            <span v-else>确认重置并登录</span>
          </button>
        </div>

        <div class="back-link-wrap">
          <button type="button" class="text-link" @click="backToLogin">
            <ArrowLeft :size="14" />
            <span>返回密码登录</span>
          </button>
        </div>
      </form>

      <footer class="modal-footer">
        <p>
          所有学习记录与词书设置将在多端加密安全同步，本地已有进度自动保留。
        </p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.wechat-login-option{padding:18px 24px 24px;border-top:1px solid var(--line);text-align:center}.wechat-login-option p{font-size:12px;line-height:1.6;color:var(--muted);margin:10px 0 0}.wechat-action{width:100%;min-height:42px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--green);cursor:pointer}.wechat-open{display:inline-block;margin-top:12px;color:var(--green);text-decoration:underline}.wechat-login-option .error-msg{color:#873c2c}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(24, 30, 26, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 16px;
}

.login-modal {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(54, 93, 73, 0.15);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  color: #365d49;
  background: #edf3ee;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-block;
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

.modal-desc {
  font-size: 0.88rem;
  color: #55665d;
  line-height: 1.5;
  margin: 0;
}

.info-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #f4f8f5;
  border: 1px solid #d3e2d7;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 0.82rem;
  color: #2e4738;
}

.info-banner strong {
  display: block;
  font-size: 0.86rem;
  margin-bottom: 2px;
  color: #24342b;
}

.info-banner p {
  margin: 0;
  line-height: 1.4;
  color: #52675b;
}

.info-icon {
  color: #365d49;
  flex-shrink: 0;
  margin-top: 2px;
}

.email-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f1f5f2;
  border: 1px solid #dbe5de;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.85rem;
}

.email-text {
  color: #24342b;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.switch-email-btn {
  background: none;
  border: none;
  color: #365d49;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.switch-email-btn:hover {
  text-decoration: underline;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.field label {
  font-size: 0.82rem;
  font-weight: 500;
  color: #3c4d44;
}

.text-link {
  background: none;
  border: none;
  color: #365d49;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.text-link:hover {
  text-decoration: underline;
}

.input-wrap {
  display: flex !important;
  align-items: center !important;
  background: #fafbf9 !important;
  border: 1.5px solid #c9d5ce !important;
  border-radius: 10px !important;
  padding: 0 14px !important;
  margin-top: 6px !important;
  min-height: 46px !important;
  box-sizing: border-box !important;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}

.input-wrap:focus-within {
  border-color: #365d49 !important;
  box-shadow: 0 0 0 3px rgba(54, 93, 73, 0.12) !important;
  background: #ffffff !important;
}

.icon-slot {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: #7e9186 !important;
  margin-right: 10px !important;
  flex-shrink: 0 !important;
}

.toggle-pwd-btn {
  background: none;
  border: none;
  color: #8c9e94;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 0.15s;
}

.toggle-pwd-btn:hover {
  color: #24342b;
}

:deep(input.modal-input),
.login-modal input.modal-input,
.login-modal .input-wrap input {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  width: 100% !important;
  border: none !important;
  outline: none !important;
  background: transparent !important;
  padding: 10px 0 !important;
  margin: 0 !important;
  font-size: 0.95rem !important;
  line-height: 1.5 !important;
  color: #24342b !important;
  box-shadow: none !important;
}

:deep(input.modal-input:focus),
.login-modal input.modal-input:focus,
.login-modal .input-wrap input:focus {
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}

.code-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.code-input {
  flex: 1;
}

.send-btn {
  height: 46px;
  min-height: 46px;
  padding: 0 16px;
  margin-top: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #365d49;
  background: #edf3ee;
  border: 1.5px solid #c9d5ce;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.send-btn:hover:not(:disabled) {
  background: #dfe9e1;
}

.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-msg {
  font-size: 0.82rem;
  color: #b33927;
  background: #fdf2f0;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #f6cfc9;
}

.success-msg {
  font-size: 0.82rem;
  color: #2c6e49;
  background: #f0f7f3;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #c7e5d2;
}

.actions {
  margin-top: 4px;
}

.submit-btn {
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

.submit-btn:hover:not(:disabled) {
  background: #2b4b3b;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.back-link-wrap {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

.modal-footer p {
  font-size: 0.76rem;
  color: #83948b;
  line-height: 1.4;
  margin: 0;
  text-align: center;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
