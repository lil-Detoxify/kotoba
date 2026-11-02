import { onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import type { Word } from '@jp/models';
import audioMap from '../audio-map.json';
import { usePronunciationPreference, type PronunciationVoice } from '../services/pronunciationPreference';
import { getGoogleAudioUrl } from '../services/audioUrl';
import { getGoogleSentenceAudioUrl, hasGoogleSentenceAudio, prepareGoogleSentenceAudio, normalizeSentenceAudioText } from '../services/sentence-audio';
import {audioPrefetchAllowed,createWordAudioPrefetch} from '../services/word-audio-prefetch';

const bundled = audioMap as Record<string, string>;

type PlaybackSource =
  | { kind: 'google'; voice: PronunciationVoice }
  | { kind: 'book' | 'bundled' }
  | { kind: 'device' };

interface AudioCandidate {
  url: string;
  source: PlaybackSource;
}

export function usePronunciation() {
  const { voice: selectedVoice, voiceModel, setVoice } = usePronunciationPreference();
  const hasJapaneseVoice = ref(false);
  const speaking = ref(false);
  const loading = ref(false);
  const error = ref('');
  const sentenceSpeaking = ref(false);
  const sentenceError = ref('');
  let audio: HTMLAudioElement | undefined;
  let generation = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancelPendingPlayback: (() => void) | undefined;
  const prefetchCache=createWordAudioPrefetch(3);
  let prefetchGeneration=0;
  const lastSourceByWord = reactive(new Map<string, PlaybackSource>());
  const failedWordIds = reactive(new Set<string>());
  const lastSourceBySentence = reactive(new Map<string, PlaybackSource>());
  const failedSentences = reactive(new Set<string>());

  const synth = typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis;
  const deviceVoice = () => synth?.getVoices().find(voice => /^ja(?:-|_)/i.test(voice.lang));

  function fallbackAudioCandidates(word: Word): AudioCandidate[] {
    const candidates: AudioCandidate[] = [];
    if (word.audioUrl) candidates.push({ url: word.audioUrl, source: { kind: 'book' } });
    const audioKey = `${word.audioTerm || word.rawTerm || word.term}|${word.reading}`;
    const bundledUrls = [bundled[audioKey], bundled[`${word.term}|${word.reading}`]];
    for (const url of bundledUrls) {
      if (url && !candidates.some(candidate => candidate.url === url)) {
        candidates.push({ url, source: { kind: 'bundled' } });
      }
    }
    return candidates;
  }

  function source(word: Word): string | undefined {
    return fallbackAudioCandidates(word)[0]?.url;
  }

  function clearPrefetch():void{prefetchGeneration++;prefetchCache.clear()}
  async function prefetch(words:readonly Word[]):Promise<void>{
    const ticket=++prefetchGeneration;const voice=selectedVoice.value;
    const urls=await Promise.all(words.slice(0,3).map(async word=>{
      try{return await getGoogleAudioUrl(word.audioTerm||word.rawTerm||word.term,word.reading,voice)||source(word)}
      catch{return source(word)}
    }));
    if(ticket!==prefetchGeneration||voice!==selectedVoice.value)return;
    prefetchCache.prepare(urls.filter((url):url is string=>!!url));
  }

  function available(word: Word): boolean {
    return !!word.reading || !!source(word) || hasJapaneseVoice.value;
  }

  function stop(): void {
    generation++;
    const cancel = cancelPendingPlayback;
    cancelPendingPlayback = undefined;
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    cancel?.();

    const currentAudio = audio;
    audio = undefined;
    if (currentAudio) {
      currentAudio.onerror = null;
      currentAudio.onended = null;
      currentAudio.pause();
    }
    synth?.cancel();
    speaking.value = false;
    loading.value = false;
    sentenceSpeaking.value = false;
    sentenceError.value = '';
  }

  watch(selectedVoice, () => {
    stop();
    clearPrefetch();
    lastSourceByWord.clear();
    failedWordIds.clear();
    lastSourceBySentence.clear();
    failedSentences.clear();
    error.value = '';
  });

  function selectedVoiceLabel(voice: PronunciationVoice): string {
    return voice === 'female' ? '女声 A' : '男声 C';
  }

  function recordSuccessfulSource(word: Word, ticket: number, playbackSource: PlaybackSource): void {
    if (ticket !== generation) return;
    lastSourceByWord.set(word.id, playbackSource);
    failedWordIds.delete(word.id);
    speaking.value = true;
    loading.value = false;
  }

  function failPlayback(word: Word, ticket: number): void {
    if (ticket !== generation) return;
    stop();
    failedWordIds.add(word.id);
    lastSourceByWord.delete(word.id);
    error.value = '音频无法播放，请重试或切换题型';
  }

  function recordSentenceSource(text: string, ticket: number, playbackSource: PlaybackSource): void {
    if (ticket !== generation) return;
    const key = normalizeSentenceAudioText(text);
    lastSourceBySentence.set(key, playbackSource);
    failedSentences.delete(key);
    speaking.value = true;
    sentenceSpeaking.value = true;
  }

  function failSentencePlayback(text: string, ticket: number): void {
    if (ticket !== generation) return;
    stop();
    const key = normalizeSentenceAudioText(text);
    failedSentences.add(key);
    lastSourceBySentence.delete(key);
    sentenceError.value = '例句暂时无法朗读，请重试。';
  }

  function playAudioCandidate(
    word: Word,
    candidate: AudioCandidate,
    slow: boolean,
    ticket: number,
    continueFallback: () => Promise<boolean>,
    sentence = false,
  ): Promise<boolean> {
    return new Promise(resolve => {
      if (ticket !== generation) {
        resolve(false);
        return;
      }

      let media: HTMLAudioElement;
      try {
        media = (!sentence?prefetchCache.take(candidate.url):undefined)??new Audio(candidate.url);
      } catch {
        resolve(false);
        return;
      }

      let settled = false;
      let started = false;
      let lateErrorHandled = false;
      let localTimeout: ReturnType<typeof setTimeout> | undefined;
      media.playbackRate = slow ? 0.75 : 1;
      if (sentence) media.preservesPitch = true;
      audio = media;

      const clearPending = () => {
        if (localTimeout) {
          clearTimeout(localTimeout);
          if (timeout === localTimeout) timeout = undefined;
          localTimeout = undefined;
        }
        if (cancelPendingPlayback === cancel) cancelPendingPlayback = undefined;
      };

      const detachAndPause = () => {
        media.onerror = null;
        media.onended = null;
        media.pause();
        if (audio === media) audio = undefined;
      };

      const finishBeforeStart = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearPending();
        if (!success || ticket !== generation) {
          detachAndPause();
          resolve(false);
          return;
        }
        started = true;
        if (sentence) recordSentenceSource(word.term, ticket, candidate.source);
        else recordSuccessfulSource(word, ticket, candidate.source);
        resolve(true);
      };

      const cancel = () => finishBeforeStart(false);
      cancelPendingPlayback = cancel;
      media.onended = () => {
        if (ticket === generation) {
          speaking.value = false;
          if (sentence) sentenceSpeaking.value = false;
        }
      };
      media.onerror = () => {
        if (!started) {
          finishBeforeStart(false);
          return;
        }
        if (lateErrorHandled || ticket !== generation) return;
        lateErrorHandled = true;
        media.onerror = null;
        media.onended = null;
        media.pause();
        if (audio === media) audio = undefined;
        if (sentence) lastSourceBySentence.delete(normalizeSentenceAudioText(word.term));
        else lastSourceByWord.delete(word.id);
        speaking.value = true;
        if(!sentence)loading.value=true;
        const fail = () => sentence ? failSentencePlayback(word.term, ticket) : failPlayback(word, ticket);
        void continueFallback().then(success => {
          if (!success) fail();
        }).catch(fail);
      };

      localTimeout = setTimeout(() => finishBeforeStart(false), 10_000);
      timeout = localTimeout;
      try {
        Promise.resolve(media.play()).then(
          () => finishBeforeStart(true),
          () => finishBeforeStart(false),
        );
      } catch {
        finishBeforeStart(false);
      }
    });
  }

  function playOnDevice(word: Word, slow: boolean, ticket: number, sentence=false): Promise<boolean> {
    if (ticket !== generation || !synth) return Promise.resolve(false);
    const voice = deviceVoice();
    if (!voice) return Promise.resolve(false);

    return new Promise(resolve => {
      let settled = false;
      let started = false;
      let localTimeout: ReturnType<typeof setTimeout> | undefined;
      let utterance: SpeechSynthesisUtterance;
      try {
        utterance = new SpeechSynthesisUtterance(sentence ? word.term : word.reading || word.audioTerm || word.rawTerm || word.term);
      } catch {
        resolve(false);
        return;
      }
      utterance.lang = 'ja-JP';
      utterance.voice = voice;
      utterance.rate = slow ? 0.65 : 0.9;

      const clearPending = () => {
        if (localTimeout) {
          clearTimeout(localTimeout);
          if (timeout === localTimeout) timeout = undefined;
          localTimeout = undefined;
        }
        if (cancelPendingPlayback === cancel) cancelPendingPlayback = undefined;
      };

      const finishBeforeStart = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearPending();
        if (!success || ticket !== generation) {
          utterance.onstart = null;
          utterance.onend = null;
          utterance.onerror = null;
          resolve(false);
          return;
        }
        started = true;
        if(sentence) recordSentenceSource(word.term, ticket, { kind: 'device' });
        else recordSuccessfulSource(word, ticket, { kind: 'device' });
        resolve(true);
      };

      const cancel = () => finishBeforeStart(false);
      cancelPendingPlayback = cancel;
      utterance.onstart = () => finishBeforeStart(true);
      utterance.onend = () => {
        if (ticket === generation) {speaking.value = false;sentenceSpeaking.value=false;}
      };
      utterance.onerror = () => {
        if (!started) {
          finishBeforeStart(false);
          return;
        }
        if (ticket === generation) {
          if(sentence) failSentencePlayback(word.term, ticket);
          else failPlayback(word, ticket);
        }
      };
      localTimeout = setTimeout(() => {
        if (!started && ticket === generation) synth.cancel();
        finishBeforeStart(false);
      }, 8_000);
      timeout = localTimeout;
      try {
        synth.speak(utterance);
      } catch {
        finishBeforeStart(false);
      }
    });
  }

  function canPlaySentence(ja: string): boolean {
    return !!normalizeSentenceAudioText(ja) && (hasGoogleSentenceAudio(ja, selectedVoice.value) || hasJapaneseVoice.value);
  }

  function sentenceSourceLabel(ja: string): string {
    const key = normalizeSentenceAudioText(ja);
    const actual = lastSourceBySentence.get(key);
    if (actual?.kind === 'google') return `Google WaveNet · ${selectedVoiceLabel(actual.voice)}`;
    if (actual?.kind === 'device') return hasGoogleSentenceAudio(ja, selectedVoice.value) ? '设备日语语音 · 回退朗读' : '设备日语语音';
    if (failedSentences.has(key)) return '朗读暂不可用';
    if (hasGoogleSentenceAudio(ja, selectedVoice.value)) return `Google WaveNet · ${selectedVoiceLabel(selectedVoice.value)}`;
    return hasJapaneseVoice.value ? '设备日语语音' : '这台设备暂无日语语音';
  }

  function waitForSentenceClip(text: string, voice: PronunciationVoice): Promise<string | undefined> {
    return new Promise(resolve => {
      let finished = false;
      const localTimeout = setTimeout(() => finish(undefined), 8_000);
      const cancel = () => finish(undefined);
      const finish = (url: string | undefined) => {
        if (finished) return;
        finished = true;
        clearTimeout(localTimeout);
        if (timeout === localTimeout) timeout = undefined;
        if (cancelPendingPlayback === cancel) cancelPendingPlayback = undefined;
        resolve(url);
      };
      timeout = localTimeout;
      cancelPendingPlayback = cancel;
      void prepareGoogleSentenceAudio().then(() => finish(getGoogleSentenceAudioUrl(text, voice)));
    });
  }

  async function playSentence(ja: string, _reading = '', slow = false): Promise<boolean> {
    const text = normalizeSentenceAudioText(ja);
    if (!text) return false;
    stop();
    error.value = '';
    lastSourceBySentence.delete(text);
    failedSentences.delete(text);
    const ticket = generation;
    const voice = selectedVoice.value;
    let clip = getGoogleSentenceAudioUrl(text, voice);
    if (!clip && hasGoogleSentenceAudio(text, voice)) {
      speaking.value = true;
      sentenceSpeaking.value = true;
      clip = await waitForSentenceClip(text, voice);
      if (ticket !== generation) return false;
    }
    if (!clip && (!synth || !deviceVoice())) {
      if (hasGoogleSentenceAudio(text, voice)) {
        failSentencePlayback(text, ticket);
      } else {
        speaking.value = false;
        sentenceSpeaking.value = false;
        sentenceError.value = '这台设备暂未提供日语朗读语音。';
      }
      return false;
    }
    speaking.value = true;
    sentenceSpeaking.value = true;
    // Preserve kanji and punctuation for natural device phrasing. The reading
    // argument stays compatible with existing callers, but never replaces text.
    const sentence: Word = { id: 'sentence', lessonId: 'sentence', term: text, reading: '', meaning: '', order: 0 };
    const fallback = () => playOnDevice(sentence, slow, ticket, true);
    try {
      let success = clip ? await playAudioCandidate(sentence, { url: clip, source: { kind: 'google', voice } }, slow, ticket, fallback, true) : false;
      if (!success && ticket === generation) success = await fallback();
      if (!success) failSentencePlayback(text, ticket);
      return success && ticket === generation;
    } catch {
      failSentencePlayback(text, ticket);
      return false;
    }
  }

  async function play(word: Word, slow = false): Promise<boolean> {
    stop();
    error.value = '';
    lastSourceByWord.delete(word.id);
    failedWordIds.delete(word.id);
    const ticket = generation;
    const voice = selectedVoice.value;
    speaking.value = true;
    loading.value = true;

    const candidates: AudioCandidate[] = [];
    try {
      const googleUrl = await getGoogleAudioUrl(word.audioTerm || word.rawTerm || word.term, word.reading, voice);
      if (googleUrl) candidates.push({ url: googleUrl, source: { kind: 'google', voice } });
    } catch {
      // A missing Google asset should continue through the word's other sources.
    }
    if (ticket !== generation) return false;

    for (const fallback of fallbackAudioCandidates(word)) {
      if (!candidates.some(candidate => candidate.url === fallback.url)) candidates.push(fallback);
    }

    let nextCandidate = 0;
    const tryRemainingSources = async (): Promise<boolean> => {
      if (ticket !== generation) return false;
      while (nextCandidate < candidates.length) {
        const candidate = candidates[nextCandidate++];
        const success = await playAudioCandidate(word, candidate, slow, ticket, tryRemainingSources);
        if (success) return true;
        if (ticket !== generation) return false;
      }
      return playOnDevice(word, slow, ticket);
    };

    try {
      const success = await tryRemainingSources();
      if (!success) failPlayback(word, ticket);
      return success && ticket === generation;
    } catch {
      failPlayback(word, ticket);
      return false;
    }
  }

  function sourceLabel(word: Word): string {
    const actual = lastSourceByWord.get(word.id);
    if (actual?.kind === 'google') return `Google WaveNet · ${selectedVoiceLabel(actual.voice)}`;
    if (actual?.kind === 'book') return '词书音频 · 回退发音';
    if (actual?.kind === 'bundled') return '本地打包音频 · 回退发音';
    if (actual?.kind === 'device') return '设备日语语音';
    if (failedWordIds.has(word.id)) return '发音不可用';
    if (word.reading) return `优先尝试 Google WaveNet · ${selectedVoiceLabel(selectedVoice.value)}`;
    if (word.audioUrl) return '待尝试 · 词书音频';
    if (source(word)) return '待尝试 · 本地打包音频';
    return '待尝试 · 设备日语语音';
  }

  function update(): void {
    hasJapaneseVoice.value = !!deviceVoice();
  }

  onMounted(() => {
    update();
    synth?.addEventListener('voiceschanged', update);
    if (audioPrefetchAllowed()) void prepareGoogleSentenceAudio();
  });
  onUnmounted(() => {
    stop();
    clearPrefetch();
    synth?.removeEventListener('voiceschanged', update);
  });

  return {
    available, play, stop, error, speaking, loading, hasJapaneseVoice, source, sourceLabel,prefetch,clearPrefetch,
    selectedVoice, voiceModel, setVoice,
    playSentence, canPlaySentence, sentenceSourceLabel, sentenceSpeaking, sentenceError,
  };
}
