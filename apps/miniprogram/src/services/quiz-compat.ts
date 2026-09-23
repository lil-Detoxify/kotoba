import type { QuizAttempt } from "@jp/models";

// Older listening quizzes intentionally used an empty visual prompt. Keep the
// quiz result and its FSRS event while giving the synced record stable text.
export const AUDIO_MEANING_PROMPT = "听音辨意";

export function normalizeLegacyAudioPrompt(type: unknown, prompt: unknown): unknown {
  return type === "audio-meaning" && typeof prompt === "string" && !prompt.trim()
    ? AUDIO_MEANING_PROMPT
    : prompt;
}

export function normalizeLegacyQuizAttempt(attempt: QuizAttempt): QuizAttempt {
  const prompt = normalizeLegacyAudioPrompt(attempt.type, attempt.prompt);
  return prompt === attempt.prompt ? attempt : { ...attempt, prompt: prompt as string };
}
