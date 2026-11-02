import type { Data, Word } from "@jp/models";
import { sessionSummary, weakPracticeSuggestions } from "../../../web/src/services/study-feedback";
import type { SessionSummary, WeakPracticeSuggestion } from "../../../web/src/services/study-feedback";
import { practiceFeedback } from "../../../web/src/services/practice-feedback";
import type { PracticeFeedbackReport } from "../../../web/src/services/practice-feedback";

export type { PracticeFeedbackReport, SessionSummary, WeakPracticeSuggestion };

const MINI_STUDY_FEEDBACK_OWNER = "__kotobud_miniprogram_study_feedback__";

/** Normalize only a derived copy so shared Web rules include the active Mini account. */
function sharedFeedbackData(data: Data): Data {
  return {
    ...data,
    states: data.states.map((state) => ({ ...state, userId: MINI_STUDY_FEEDBACK_OWNER })),
    logs: data.logs.map((log) => ({
      ...log,
      userId: MINI_STUDY_FEEDBACK_OWNER,
      previousState: { ...log.previousState, userId: MINI_STUDY_FEEDBACK_OWNER },
      newState: { ...log.newState, userId: MINI_STUDY_FEEDBACK_OWNER },
    })),
  };
}

/** Adapt the Mini Program's account-partitioned snapshot for the shared Web rules. */
export function miniWeakPracticeSuggestions(
  data: Data,
  now = new Date(),
  bookId?: string,
  limit = 5,
): WeakPracticeSuggestion[] {
  return weakPracticeSuggestions(sharedFeedbackData(data), now, MINI_STUDY_FEEDBACK_OWNER, bookId, limit);
}

/** Adapt Mini Program review history to the shared, per-question-type feedback report. */
export function miniPracticeFeedback(
  data: Data,
  now: Date,
  range: 7 | 30,
  bookId?: string,
): PracticeFeedbackReport {
  return practiceFeedback(sharedFeedbackData(data), now, range, MINI_STUDY_FEEDBACK_OWNER, bookId);
}

export function miniSessionSummary(data: Data, queue: Word[], index: number, baseline: number[]): SessionSummary {
  return sessionSummary(sharedFeedbackData(data), queue, index, baseline, MINI_STUDY_FEEDBACK_OWNER);
}
