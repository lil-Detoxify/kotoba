import type { Data, Word } from "@jp/models";
import { dailyStudyPlan } from "../../../web/src/services/daily-study-plan";
import type { DailyStudyPlan } from "../../../web/src/services/daily-study-plan";
import type { DailyPace } from "./study-plan-preference";

export type { DailyStudyPlan };

// The Mini Program repository already partitions data by account. Normalize
// state owners only in this derived view so the shared Web rule considers the
// same first state per word without changing the repository data.
const MINI_PLAN_STATE_OWNER = "__kotobud_daily_plan__";

export function miniDailyStudyPlan(data: Data, bookId: string, pace: DailyPace, now = new Date()): DailyStudyPlan {
  const planData: Data = {
    ...data,
    states: data.states.map((state) => ({ ...state, userId: MINI_PLAN_STATE_OWNER })),
  };
  return dailyStudyPlan(planData, bookId, pace, now, MINI_PLAN_STATE_OWNER);
}

export function miniDailyStudyWords(data: Data, bookId: string, pace: DailyPace, now = new Date()): Word[] {
  const plan = miniDailyStudyPlan(data, bookId, pace, now);
  const wordsById = new Map(data.words.map((word) => [word.id, word]));
  return plan.pendingWordIds.flatMap((id) => {
    const word = wordsById.get(id);
    return word ? [word] : [];
  });
}
