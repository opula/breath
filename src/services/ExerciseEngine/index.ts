import { range } from 'lodash';
import type { Exercise } from '../../types/exercise';
import { TimedStepExecutor } from './TimedStepExecutor';
import type {
  BreathPhaseIndex,
  ExerciseEngineCallbacks,
  ExerciseEngineOptions,
  SchedulerLike,
  SoundType,
} from './types';

const BREATH_LABELS: readonly string[] = ['inhale', 'hold', 'exhale', 'hold'];

export class ExerciseEngine {
  private exercises: Exercise[];
  private scheduler: SchedulerLike;
  private callbacks: ExerciseEngineCallbacks;
  private options: ExerciseEngineOptions;
  private timedStep: TimedStepExecutor;

  private exerciseIndex: number;
  private seqIndex = -1;
  private loopCount = 0;
  private breathPattern = [0, 0, 0, 0];
  private destroyed = false;

  constructor(
    exercises: Exercise[],
    scheduler: SchedulerLike,
    callbacks: ExerciseEngineCallbacks,
    options: ExerciseEngineOptions = {},
  ) {
    this.exercises = exercises;
    this.scheduler = scheduler;
    this.callbacks = callbacks;
    this.options = options;
    this.timedStep = new TimedStepExecutor(scheduler);
    this.exerciseIndex = options.getInitialExerciseIndex?.() ?? 0;
  }

  // --- Control ---

  start(): void {
    if (this.destroyed) return;
    this.scheduler.start();
    this.nextStep();
    this.callbacks.onPauseChange(false);
  }

  pause(): void {
    if (this.destroyed) return;
    this.callbacks.onHaptic();
    this.scheduler.toggle();
    const isPaused = !this.scheduler.active();

    if (!isPaused) {
      this.callbacks.onPauseChange(false);
    } else {
      this.callbacks.onPauseChange(true);
    }
  }

  toggle(): void {
    this.pause();
  }

  reset(andStop = false): void {
    if (this.destroyed) return;
    this.scheduler.reset();

    this.callbacks.onAnimateBreath(0, 0);
    this.seqIndex = -1;
    this.loopCount = 0;
    this.breathPattern = [0, 0, 0, 0];

    this.callbacks.onHaptic();

    if (andStop) {
      this.callbacks.onStateChange({
        label: '',
        sublabel: '',
        isBreathing: false,
        isText: false,
      });
      this.scheduler.stop();
      this.callbacks.onPauseChange(true);
    } else {
      this.scheduler.start();
      this.nextStep();
      this.callbacks.onPauseChange(false);
    }
  }

  // --- Navigation ---

  advance(): void {
    if (this.destroyed) return;

    // Not started yet — start the exercise
    if (this.seqIndex === -1) {
      this.start();
      return;
    }

    // Paused — toggle resume
    if (!this.scheduler.active()) {
      this.toggle();
      return;
    }

    const exercise = this.currentExercise();
    const { count } = exercise.seq[this.seqIndex];

    // Can only manually advance on count===0 steps
    if (count !== 0) return;

    this.scheduler.clearJobs();
    this.callbacks.onHaptic();
    this.callbacks.onAnimateBreath(0, 0);
    this.nextStep();
  }

  nextExercise(delta: number): void {
    if (this.destroyed) return;
    const len = this.exercises.length;
    const nextIndex = (len + this.exerciseIndex + delta) % len;
    this.exerciseIndex = nextIndex;

    if (this.seqIndex !== -1) {
      this.reset(true);
    } else {
      this.callbacks.onAnimateBreath(0, 0);
    }

    this.options.saveExerciseIndex?.(nextIndex);
  }

  setExercise(index: number): void {
    if (this.destroyed) return;
    this.exerciseIndex = index;
    this.reset();
  }

  // --- Queries ---

  isActive(): boolean {
    return this.scheduler.active();
  }

  canAdvance(): boolean {
    if (this.seqIndex === -1) return true;
    const exercise = this.currentExercise();
    return exercise.seq[this.seqIndex].count === 0;
  }

  getExerciseName(): string {
    return this.currentExercise().name;
  }

  getExerciseIndex(): number {
    return this.exerciseIndex;
  }

  isStarted(): boolean {
    return this.seqIndex !== -1;
  }

  // --- Lifecycle ---

  updateExercises(exercises: Exercise[]): void {
    this.exercises = exercises;
  }

  destroy(): void {
    this.destroyed = true;
    this.scheduler.reset();
  }

  // --- Internal: Sequence stepping ---

  private currentExercise(): Exercise {
    return this.exercises[this.exerciseIndex];
  }

  private nextStep(): void {
    const exercise = this.currentExercise();
    const currentIndex = this.seqIndex;
    const nextIndex = (this.seqIndex + 1) % exercise.seq.length;

    // Non-loopable exercise that wrapped around — reset and restart
    if (!exercise.loopable && nextIndex < currentIndex) {
      this.reset();
      return;
    }

    const step = exercise.seq[nextIndex];
    this.seqIndex = nextIndex;

    switch (step.type) {
      case 'breath':
        this.breathPattern = (step.value as number[]).slice();
        this.loopCount = 0;
        this.startBreathPhase(currentIndex > -1);
        this.callbacks.onStateChange({
          label: BREATH_LABELS[0],
          sublabel: `n° ${step.count ? step.count : 1}`,
          isBreathing: true,
          isText: false,
        });
        break;

      case 'text':
        this.startTextStep();
        this.callbacks.onStateChange({
          label: step.text!,
          sublabel: '',
          isBreathing: false,
          isText: true,
        });
        break;

      case 'hold':
      case 'inhale':
      case 'exhale':
        this.startHIEStep();
        break;
    }
  }

  // --- Internal: Breathing pattern ---

  private startBreathPhase(isLooped: boolean): void {
    const exercise = this.currentExercise();
    const stepTime = this.breathPattern[0];
    const { count } = exercise.seq[this.seqIndex];

    if (this.isSoundEnabled()) {
      this.callbacks.onPlaySound('inhale');
    }

    this.scheduler.addJob(
      0,
      () => {
        this.callbacks.onAnimateBreath(1, stepTime);
        if (isLooped) {
          this.callbacks.onVibrate(400);
        }
      },
      { priority: 0 },
    );

    this.scheduler.addJob(
      stepTime * 1000,
      () => {
        this.callbacks.onVibrate(400);
        this.stepBreathPhase(1);
      },
      { priority: 1, label: 'Next seq' },
    );
  }

  private stepBreathPhase(step: number): void {
    const exercise = this.currentExercise();
    const stepIndex = (step % 4) as BreathPhaseIndex;
    const stepTime = this.breathPattern[stepIndex];
    const currentSeqIndex = this.seqIndex;
    const nextIndex = (this.seqIndex + 1) % exercise.seq.length;
    const totalPatterns = exercise.seq[currentSeqIndex].count;
    const completedPatterns = Math.floor(step / 4);
    const nextVibratePattern =
      exercise.seq[nextIndex].type === 'breath' ? 400 : [300, 300];
    const { count } = exercise.seq[currentSeqIndex];

    // Skip zero-duration phases
    if (stepTime === 0) {
      if (
        stepIndex === 3 &&
        totalPatterns !== 0 &&
        completedPatterns + 1 >= totalPatterns
      ) {
        this.callbacks.onVibrate(nextVibratePattern);
        this.nextStep();
        return;
      }
      this.stepBreathPhase(step + 1);
      return;
    }

    // Animate breath ring
    if (stepIndex === 0) {
      this.callbacks.onAnimateBreath(1, stepTime);
    } else if (stepIndex === 2) {
      this.callbacks.onAnimateBreath(0, stepTime);
    }

    // Update label/sublabel
    const sublabel = `n° ${count ? count - completedPatterns : completedPatterns + 1}`;

    if (this.isSoundEnabled()) {
      this.callbacks.onPlaySound(BREATH_LABELS[stepIndex] as SoundType);
    }

    this.callbacks.onStateChange({
      label: BREATH_LABELS[stepIndex],
      sublabel,
      isBreathing: true,
      isText: false,
    });

    // Schedule next step
    this.scheduler.addJob(
      stepTime * 1000,
      () => {
        if (
          stepIndex === 3 &&
          totalPatterns !== 0 &&
          completedPatterns + 1 >= totalPatterns
        ) {
          this.callbacks.onVibrate(nextVibratePattern);
          this.nextStep();
          return;
        }
        this.callbacks.onVibrate(400);
        this.stepBreathPhase(step + 1);
      },
      { priority: 1, label: 'Next seq' },
    );
  }

  // --- Internal: HIE (Hold/Inhale/Exhale) steps ---

  private startHIEStep(): void {
    const exercise = this.currentExercise();
    const step = exercise.seq[this.seqIndex];
    const { type, count } = step;

    if (this.isSoundEnabled()) {
      this.callbacks.onPlaySound(type as SoundType);
    }

    this.callbacks.onStateChange({
      label: type,
      sublabel: '',
      isBreathing: false,
      isText: false,
    });

    this.timedStep.execute({
      label: type,
      count,
      onTick: (sublabel) => {
        this.callbacks.onStateChange({
          label: type,
          sublabel,
          isBreathing: false,
          isText: false,
        });
      },
      onComplete: () => {
        this.callbacks.onHaptic();
        this.nextStep();
      },
    });
  }

  // --- Internal: Text steps ---

  private startTextStep(): void {
    const exercise = this.currentExercise();
    const step = exercise.seq[this.seqIndex];
    const { count } = step;
    const text = step.text!;

    this.timedStep.execute({
      label: text,
      count,
      onTick: (sublabel) => {
        this.callbacks.onStateChange({
          label: text,
          sublabel,
          isBreathing: false,
          isText: true,
        });
      },
      onComplete: () => {
        this.callbacks.onHaptic();
        this.nextStep();
      },
    });
  }

  // --- Helpers ---

  private isSoundEnabled(): boolean {
    return this.options.isSoundEnabled?.() ?? false;
  }
}
