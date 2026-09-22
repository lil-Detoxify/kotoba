import { initialState, stateFor } from "@jp/core";
import type { Data } from "@jp/models";
import { defaultRepository } from "../adapters";
import type { MiniProgramRepositoryContract } from "../adapters/types";
import { progressQueueItem } from "./sync-outbox";

export function setDifficult(wordId: string, value: boolean, repository: MiniProgramRepositoryContract = defaultRepository): Promise<Data> {
  const key = repository.getActiveKey();
  let updatedState: Data["states"][number] | undefined;
  const change = (data: Data) => {
    const word = data.words.find((entry) => entry.id === wordId);
    if (!word) throw new Error("词条尚未下载，请先打开所属词书");
    let state = stateFor(data, wordId);
    if (!state) { state = initialState(wordId); data.states.push(state); }
    state.isDifficult = value;
    state.difficultUpdatedAt = new Date().toISOString();
    state.updatedAt = state.difficultUpdatedAt;
    state.lessonId = word.lessonId;
    state.bookId = data.lessons.find((lesson) => lesson.id === word.lessonId)?.bookId;
    updatedState = state;
  };
  if (repository.transactAndEnqueue) {
    return repository.transactAndEnqueue(change, () => updatedState ? [progressQueueItem(updatedState)] : [], key);
  }
  return repository.transact(change, key);
}
