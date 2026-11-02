import payload from '../learning-scene-tasks.json';

export interface SceneTaskLine {
  ja: string;
  reading: string;
  zh: string;
}

export interface SceneTaskOption extends SceneTaskLine {
  id: string;
  feedback: string;
}

export interface SceneTaskStep {
  id: string;
  context: string;
  speaker: string;
  prompt: SceneTaskLine;
  options: SceneTaskOption[];
  correctOptionId: string;
  tip: string;
}

export interface SceneTask {
  id: string;
  sceneId: string;
  title: string;
  role: string;
  setting: string;
  canDo: string;
  steps: SceneTaskStep[];
}

export interface SceneTaskAnswer {
  stepId: string;
  optionId: string;
  correct: boolean;
}

export interface SceneTaskRun {
  taskId: string;
  mode: 'task' | 'mistakes';
  stepIds: string[];
  index: number;
  answers: Record<string, SceneTaskAnswer>;
  firstAnswers: Record<string, SceneTaskAnswer>;
}

export const sceneTasks: SceneTask[] = payload;

export function taskForScene(sceneId: string): SceneTask | undefined {
  return sceneTasks.find(task => task.sceneId === sceneId);
}

export function createSceneTaskRun(task: SceneTask): SceneTaskRun {
  return { taskId: task.id, mode: 'task', stepIds: task.steps.map(step => step.id), index: 0, answers: {}, firstAnswers: {} };
}

export function currentSceneTaskStep(task: SceneTask, run: SceneTaskRun): SceneTaskStep | undefined {
  if (run.taskId !== task.id) return undefined;
  return task.steps.find(step => step.id === run.stepIds[run.index]);
}

/** A confirmed step stays fixed; retrying it requires a new run. */
export function confirmSceneTaskAnswer(task: SceneTask, run: SceneTaskRun, optionId: string): SceneTaskRun {
  const step = currentSceneTaskStep(task, run);
  if (!step || run.answers[step.id] || !step.options.some(option => option.id === optionId)) return run;
  const answer: SceneTaskAnswer = { stepId: step.id, optionId, correct: optionId === step.correctOptionId };
  return {
    ...run,
    answers: { ...run.answers, [step.id]: answer },
    firstAnswers: run.firstAnswers[step.id] ? run.firstAnswers : { ...run.firstAnswers, [step.id]: answer },
  };
}

export function advanceSceneTask(task: SceneTask, run: SceneTaskRun): SceneTaskRun {
  const step = currentSceneTaskStep(task, run);
  if (!step || !run.answers[step.id]) return run;
  return { ...run, index: run.index + 1 };
}

export function summarizeSceneTask(task: SceneTask, run: SceneTaskRun) {
  const valid = run.taskId === task.id;
  const stepIds = valid ? run.stepIds.filter(id => task.steps.some(step => step.id === id)) : [];
  const answers = stepIds.map(id => run.answers[id]).filter((answer): answer is SceneTaskAnswer => Boolean(answer));
  const firstAnswers = valid ? task.steps.map(step => run.firstAnswers[step.id]).filter((answer): answer is SceneTaskAnswer => Boolean(answer)) : [];
  return {
    total: stepIds.length,
    answered: answers.length,
    correct: answers.filter(answer => answer.correct).length,
    firstCorrect: firstAnswers.filter(answer => answer.correct).length,
    firstAnswered: firstAnswers.length,
    firstTotal: task.steps.length,
    mistakeIds: answers.filter(answer => !answer.correct).map(answer => answer.stepId),
    complete: valid && stepIds.length > 0 && run.index === stepIds.length && answers.length === stepIds.length,
  };
}

export function retrySceneTaskMistakes(task: SceneTask, run: SceneTaskRun): SceneTaskRun {
  const summary = summarizeSceneTask(task, run);
  if (!summary.complete || !summary.mistakeIds.length) return run;
  return { taskId: task.id, mode: 'mistakes', stepIds: summary.mistakeIds, index: 0, answers: {}, firstAnswers: { ...run.firstAnswers } };
}

/** Canonical earlier lines restore the story when practicing a skipped step. */
export function previousSceneTaskSteps(task: SceneTask, stepId: string): SceneTaskStep[] {
  const index = task.steps.findIndex(step => step.id === stepId);
  return index > 0 ? task.steps.slice(0, index) : [];
}

export function correctSceneTaskOption(step: SceneTaskStep): SceneTaskOption | undefined {
  return step.options.find(option => option.id === step.correctOptionId);
}
