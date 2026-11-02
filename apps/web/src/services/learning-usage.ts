import type { Word } from '@jp/models';
import { normalizeVocabularySearchText } from '@jp/shared';
import payload from '../learning-usage.json';
import foundation from '../learning-usage-foundation.json';
import everyday from '../learning-usage-everyday.json';
import {refinementFor} from './learning-refinement';
import {deepeningUsageFor} from './learning-usage-deepening';
import {correctedLearningContentFor} from './learning-content-corrections';
import legacyMeaningPayload from '../learning-usage-meanings.json';

export interface UsagePhrase { ja: string; reading: string; zh: string }
export interface LearningUsage {
  collocation: UsagePhrase;
  tip?: string;
  contrast?: { term: string; reading: string; collocation: UsagePhrase; note: string };
}
export interface LearningUsageRecord extends LearningUsage {
  id: string;
  forms: Array<{ term: string; reading: string }>;
}

export const learningUsageCatalog: readonly LearningUsageRecord[] = [...payload, ...foundation, ...everyday];
const key = (term: string, reading: string) => JSON.stringify([
  term.normalize('NFKC').trim(), normalizeVocabularySearchText(reading),
]);
const legacyMeanings:Record<string,string[]>=legacyMeaningPayload;
const byForm = new Map<string, LearningUsageRecord>();
for (const entry of learningUsageCatalog) {
  for (const form of entry.forms) byForm.set(key(form.term, form.reading), entry);
}

/** Only verified written forms and readings share a note; example and learner data stay independent. */
export function usageFor(word: Pick<Word, 'term' | 'reading'>&Partial<Pick<Word,'meaning'|'lessonId'>>): LearningUsage | undefined {
  const specific=correctedLearningContentFor(word)?.usage??refinementFor(word)?.usage??deepeningUsageFor(word);
  if(specific)return specific;
  const legacy=byForm.get(key(word.term,word.reading));
  if(!legacy||!word.meaning)return legacy;
  const meaning=normalizeVocabularySearchText(word.meaning);
  return legacyMeanings[legacy.id]?.some(keyword=>keyword&&meaning.includes(normalizeVocabularySearchText(keyword)))?legacy:undefined;
}
