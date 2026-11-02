// Both clients compare kana with the same pure rules. This module imports no
// browser or audio implementation and leaves the original word untouched.
export {
  createInputQuestion,
  inputAttempt,
  normalizeKanaAnswer,
} from '../../../web/src/services/kana-input';
export type {
  InputQuestion,
  InputQuizType,
} from '../../../web/src/services/kana-input';
