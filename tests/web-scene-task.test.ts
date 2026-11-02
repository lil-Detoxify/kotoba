import { describe, expect, it } from 'vitest';
import { learningScenes } from '../apps/web/src/services/learning-scenes';
import {
  advanceSceneTask, confirmSceneTaskAnswer, correctSceneTaskOption, createSceneTaskRun,
  currentSceneTaskStep, previousSceneTaskSteps, retrySceneTaskMistakes, sceneTasks,
  summarizeSceneTask, taskForScene,
} from '../apps/web/src/services/scene-task';

describe('continuous scene response tasks', () => {
  it('covers each real scene with a complete four-step role task and one correct response per step', () => {
    expect(sceneTasks.map(task => task.sceneId)).toEqual(learningScenes.map(scene => scene.id));
    expect(new Set(sceneTasks.map(task => task.id)).size).toBe(6);
    for (const task of sceneTasks) {
      expect(taskForScene(task.sceneId)).toBe(task);
      expect(task.steps).toHaveLength(4);
      expect(new Set(task.steps.map(step => step.id)).size).toBe(4);
      expect([task.role, task.setting, task.canDo].every(value => value.trim())).toBe(true);
      for (const step of task.steps) {
        expect(step.context.trim()).not.toBe('');
        expect(step.tip.trim()).not.toBe('');
        expect(step.options).toHaveLength(3);
        expect(new Set(step.options.map(option => option.id)).size).toBe(3);
        expect(new Set(step.options.map(option => option.ja)).size).toBe(3);
        expect(step.options.filter(option => option.id === step.correctOptionId)).toHaveLength(1);
        for (const line of [step.prompt, ...step.options]) {
          expect(line.ja.trim()).not.toBe('');
          expect(line.zh.trim()).not.toBe('');
          expect(line.reading).toMatch(/^[\u3040-\u30ff\s、。ー！？「」]+$/u);
        }
        expect(step.options.every(option => option.feedback.trim())).toBe(true);
      }
    }
    expect(taskForScene('unknown')).toBeUndefined();
  });

  it('requires a valid explicit answer before moving on and ignores repeat confirmations', () => {
    const task = taskForScene('shopping')!;
    const original = createSceneTaskRun(task);
    const originalSnapshot = JSON.stringify(original);
    expect(advanceSceneTask(task, original)).toBe(original);
    expect(confirmSceneTaskAnswer(task, original, 'not-an-option')).toBe(original);
    const firstStep = currentSceneTaskStep(task, original)!;
    const wrongOption = firstStep.options.find(option => option.id !== firstStep.correctOptionId)!;
    const confirmed = confirmSceneTaskAnswer(task, original, wrongOption.id);
    expect(JSON.stringify(original)).toBe(originalSnapshot);
    expect(confirmed.answers[firstStep.id].correct).toBe(false);
    expect(confirmSceneTaskAnswer(task, confirmed, firstStep.correctOptionId)).toBe(confirmed);
    expect(summarizeSceneTask(task, confirmed)).toMatchObject({ answered: 1, correct: 0, firstAnswered: 1, firstCorrect: 0, complete: false });
    const next = advanceSceneTask(task, confirmed);
    expect(currentSceneTaskStep(task, next)?.id).toBe(task.steps[1].id);
  });

  it('retries only wrong steps in story order, preserves the first score and provides earlier dialogue', () => {
    const task = taskForScene('dining')!;
    let run = createSceneTaskRun(task);
    expect(retrySceneTaskMistakes(task, run)).toBe(run);
    for (const [index, step] of task.steps.entries()) {
      const option = index === 1 || index === 3 ? step.options.find(option => option.id !== step.correctOptionId)! : correctSceneTaskOption(step)!;
      run = confirmSceneTaskAnswer(task, run, option.id);
      run = advanceSceneTask(task, run);
    }
    const summary = summarizeSceneTask(task, run);
    expect(summary).toMatchObject({ correct: 2, firstCorrect: 2, firstTotal: 4, complete: true });
    expect(summary.mistakeIds).toEqual([task.steps[1].id, task.steps[3].id]);
    const retry = retrySceneTaskMistakes(task, run);
    expect(retry.mode).toBe('mistakes');
    expect(retry.stepIds).toEqual(summary.mistakeIds);
    expect(retry.answers).toEqual({});
    expect(previousSceneTaskSteps(task, currentSceneTaskStep(task, retry)!.id)).toEqual([task.steps[0]]);
    let finishedRetry = retry;
    for (const stepId of retry.stepIds) {
      const step = task.steps.find(step => step.id === stepId)!;
      finishedRetry = advanceSceneTask(task, confirmSceneTaskAnswer(task, finishedRetry, step.correctOptionId));
    }
    expect(summarizeSceneTask(task, finishedRetry)).toMatchObject({ correct: 2, total: 2, firstCorrect: 2, firstAnswered: 4, mistakeIds: [], complete: true });
    expect(retrySceneTaskMistakes(task, finishedRetry)).toBe(finishedRetry);
    expect(previousSceneTaskSteps(task, 'unknown')).toEqual([]);
  });

  it('fresh runs clear all answers and a run cannot answer or advance another scene', () => {
    const shopping = taskForScene('shopping')!;
    const dining = taskForScene('dining')!;
    const run = confirmSceneTaskAnswer(shopping, createSceneTaskRun(shopping), shopping.steps[0].correctOptionId);
    expect(currentSceneTaskStep(dining, run)).toBeUndefined();
    expect(confirmSceneTaskAnswer(dining, run, dining.steps[0].correctOptionId)).toBe(run);
    expect(advanceSceneTask(dining, run)).toBe(run);
    expect(summarizeSceneTask(dining, run)).toMatchObject({ answered: 0, correct: 0, complete: false });
    const reset = createSceneTaskRun(shopping);
    expect(reset).toMatchObject({ index: 0, mode: 'task', answers: {}, firstAnswers: {} });
    expect(reset).not.toBe(run);
    expect(Object.keys(reset)).toEqual(['taskId', 'mode', 'stepIds', 'index', 'answers', 'firstAnswers']);
  });
});
