# 数据模型
Book: id,title,description,language,cover?,createdAt,updatedAt。
Lesson: id,bookId,title,order。Book 1:N Lesson。
Word: id,lessonId,term,reading,meaning,partOfSpeech?,accent?,example?,exampleTranslation?,audioUrl?,note?,order。Lesson 1:N Word。
WordState: userId,wordId,status(new/learning/review/mastered),isIgnored,isDifficult,firstSeenAt?,lastReviewedAt?,nextReviewAt?,reviewCount,lapseCount,card(FSRS Card)。Word 和状态分离，未来按 userId+wordId 分区。
ReviewLog: id,userId,wordId,reviewedAt,rating,responseTime,previousState,newState,studyMode(new/review/difficult)。每次评价产生不可变快照；状态和日志原子保存。
学习 session 为前端短期队列，刷新结束 session 但不丢已提交评价。mastered 为 FSRS Review 且 stability >= 30 天的展示阈值，并不免除复习。统计日界按设备本地时区，今日复习统计首次接触之外的评价事件，累计学习按首次学习词数。忽略词不进入队列，统计分母排除忽略词。

## V0.2 扩展
Word 可选 definitionJa/definitionZh/exampleReading/senses，WordSense 结构见 DICTIONARY_AND_REVIEW.md。ReviewLog 可选 quiz: QuizAttempt，保存客观题型及首次答题快照。旧记录兼容无需删除或重建。
