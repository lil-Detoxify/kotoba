export type CompletionAction = 'practice' | 'review' | 'daily' | 'finish' | 'books';

interface CompletionContext {
  invalidated: boolean;
  hasSession: boolean;
  practiceCount: number;
  dueCount: number;
  dailyRemaining: number;
  dailyTarget: number;
}

export function completionNextAction(context: CompletionContext): {
  action: CompletionAction;
  label: string;
  description: string;
} {
  if (context.invalidated) return {
    action: 'books', label: '重新选择词书', description: '账号已切换，从当前账号的词书重新开始。',
  };
  if (context.practiceCount > 0) return {
    action: 'practice', label: `再练这 ${context.practiceCount} 个词`,
    description: '把这一轮还不熟的词再巩固一次，也可以今天先到这里。',
  };
  if (context.dueCount > 0) return {
    action: 'review', label: `复习 ${context.dueCount} 个到期词`,
    description: '还有到时间温习的词，可以接着完成这一轮复习。',
  };
  if (context.dailyRemaining > 0) return {
    action: 'daily', label: '继续今日计划',
    description: `今天的词书计划还剩 ${context.dailyRemaining} 个新词，接着从未完成的部分开始。`,
  };
  if (!context.hasSession) return {
    action: 'books', label: '选择学习课次', description: '从感兴趣的一课开始，按自己的节奏学习。',
  };
  return {
    action: 'finish', label: '今天先到这里',
    description: context.dailyTarget > 0
      ? '这本词书的今日新词计划与到期复习已经完成，学习记录已保存。'
      : '这一轮已经完成，学习记录已保存。下次再继续积累。',
  };
}
