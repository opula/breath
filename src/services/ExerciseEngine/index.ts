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
  private sequenceLoop = 0;
  private breathPattern = [0, 0, 0, 0];
  private destroyed = false;
  private repeatState: {
    repeatStepIndex: number;
    blockStart: number;
    blockEnd: number;
    remaining: number;
    total: number;
  } | null = null;

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
    if (this.isHapticsEnabled()) this.callbacks.onHaptic();
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
    this.breathPattern = [0, 0, 0, 0];
    this.repeatState = null;
    this.callbacks.onRepeatChange(null);

    if (andStop) {
      this.sequenceLoop = 0;
    }

    if (this.isHapticsEnabled()) this.callbacks.onHaptic();

    if (andStop) {
      this.callbacks.onStateChange({
        label: '',
        sublabel: '',
        isBreathing: false,
        isText: false,
        isHIE: false,
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
    if (this.isHapticsEnabled()) this.callbacks.onHaptic();
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
    this.options.saveExerciseIndex?.(index);
    this.reset(true);
    this.start();
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

  private getEffectiveCount(step: Exercise['seq'][number]): number {
    const { count, ramp } = step;
    if (!count || !ramp || ramp <= 1) return count;
    return Math.round(count * (1 + this.sequenceLoop * (ramp - 1)));
  }

  getSequenceLoop(): number {
    return this.sequenceLoop;
  }

  private nextStep(): void {
    const exercise = this.currentExercise();
    const currentIndex = this.seqIndex;

    // --- Repeat-aware index computation ---
    let nextIndex: number;

    if (this.repeatState && currentIndex === this.repeatState.blockEnd) {
      // Just finished last step in repeat block
      this.repeatState.remaining--;
      if (this.repeatState.remaining > 0) {
        // More iterations — jump back to block start
        nextIndex = this.repeatState.blockStart;
        this.callbacks.onRepeatChange({
          round: this.repeatState.total - this.repeatState.remaining,
          total: this.repeatState.total,
        });
      } else {
        // Done repeating — advance past the repeat step
        const afterRepeat = this.repeatState.repeatStepIndex + 1;
        this.repeatState = null;
        this.callbacks.onRepeatChange(null);
        if (afterRepeat >= exercise.seq.length) {
          // Wrapped around
          this.sequenceLoop++;
          if (!exercise.loopable) {
            this.reset();
            return;
          }
          nextIndex = 0;
        } else {
          nextIndex = afterRepeat;
        }
      }
    } else if (this.repeatState) {
      // Mid-block — advance normally within the block
      nextIndex = currentIndex + 1;
    } else {
      // No repeat state — existing logic
      nextIndex = (this.seqIndex + 1) % exercise.seq.length;

      // Sequence wrapped — increment sequenceLoop
      if (nextIndex === 0 && currentIndex > -1) {
        this.sequenceLoop++;
      }

      // Non-loopable exercise that wrapped around — reset and restart
      if (!exercise.loopable && nextIndex < currentIndex) {
        this.reset();
        return;
      }
    }

    const step = exercise.seq[nextIndex];
    this.seqIndex = nextIndex;

    // --- If we landed on a repeat step, set up repeatState and recurse ---
    if (step.type === 'repeat') {
      if (this.repeatState) {
        // Nested repeat — skip it
        this.nextStep();
        return;
      }

      const lookback = (step.value as number[])?.[0] ?? 1;
      const repeatCount = this.getEffectiveCount(step);
      // Block already ran once; remaining = repeatCount - 1 extra iterations
      const remaining = repeatCount - 1;
      if (remaining <= 0) {
        // count<=1: block already ran once, nothing more to do — skip
        this.nextStep();
        return;
      }

      const blockStart = Math.max(0, nextIndex - lookback);
      const blockEnd = nextIndex - 1;

      if (blockEnd < blockStart) {
        // Nothing to repeat — skip
        this.nextStep();
        return;
      }

      this.repeatState = {
        repeatStepIndex: nextIndex,
        blockStart,
        blockEnd,
        remaining,
        total: repeatCount,
      };

      this.callbacks.onRepeatChange({ round: 1, total: repeatCount });

      // Jump to one before blockStart so nextStep advances into it
      this.seqIndex = blockStart - 1;
      this.nextStep();
      return;
    }

    this.executeStep(step, currentIndex);
  }

  private executeStep(step: Exercise['seq'][number], previousIndex: number): void {
    switch (step.type) {
      case 'breath': {
        const effectiveCount = this.getEffectiveCount(step);
        this.breathPattern = (step.value as number[]).slice();
        this.startBreathPhase(previousIndex > -1);
        this.callbacks.onStateChange({
          label: BREATH_LABELS[0],
          sublabel: `n° ${effectiveCount ? effectiveCount : 1}`,
          isBreathing: true,
          isText: false,
          isHIE: false,
        });
        break;
      }

      case 'text':
        this.startTextStep();
        this.callbacks.onStateChange({
          label: step.text!,
          sublabel: '',
          isBreathing: false,
          isText: true,
          isHIE: false,
        });
        break;

      case 'double-inhale':
        this.startDoubleInhaleStep();
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
    const stepTime = this.breathPattern[0];

    if (this.isSoundEnabled()) {
      this.callbacks.onPlaySound('inhale');
    }

    this.scheduler.addJob(
      0,
      () => {
        this.callbacks.onAnimateBreath(1, stepTime);
        if (isLooped && this.isHapticsEnabled()) {
          this.callbacks.onVibrate(400);
        }
      },
      { priority: 0 },
    );

    this.scheduler.addJob(
      stepTime * 1000,
      () => {
        if (this.isHapticsEnabled()) this.callbacks.onVibrate(400);
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
    const seqStep = exercise.seq[currentSeqIndex];
    const effectiveCount = this.getEffectiveCount(seqStep);
    const totalPatterns = effectiveCount;
    const completedPatterns = Math.floor(step / 4);
    const nextVibratePattern =
      exercise.seq[nextIndex].type === 'breath' ? 400 : [300, 300];
    const count = effectiveCount;

    // Skip zero-duration phases
    if (stepTime === 0) {
      if (
        stepIndex === 3 &&
        totalPatterns !== 0 &&
        completedPatterns + 1 >= totalPatterns
      ) {
        if (this.isHapticsEnabled()) this.callbacks.onVibrate(nextVibratePattern);
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
      isHIE: false,
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
          if (this.isHapticsEnabled()) this.callbacks.onVibrate(nextVibratePattern);
          this.nextStep();
          return;
        }
        if (this.isHapticsEnabled()) this.callbacks.onVibrate(400);
        this.stepBreathPhase(step + 1);
      },
      { priority: 1, label: 'Next seq' },
    );
  }

  // --- Internal: HIE (Hold/Inhale/Exhale) steps ---

  private startHIEStep(): void {
    const exercise = this.currentExercise();
    const step = exercise.seq[this.seqIndex];
    const { type } = step;
    const count = this.getEffectiveCount(step);

    if (this.isSoundEnabled()) {
      this.callbacks.onPlaySound(type as SoundType);
    }

    const showRing = type === 'inhale' || type === 'exhale';
    if (type === 'exhale') this.callbacks.onAnimateBreath(0, count || 1);
    else if (type === 'inhale') this.callbacks.onAnimateBreath(1, count || 1);

    this.callbacks.onStateChange({
      label: type,
      sublabel: '',
      isBreathing: showRing,
      isText: false,
      isHIE: !showRing,
    });

    this.timedStep.execute({
      label: type,
      count,
      onTick: (sublabel) => {
        this.callbacks.onStateChange({
          label: type,
          sublabel,
          isBreathing: showRing,
          isText: false,
          isHIE: !showRing,
        });
      },
      onComplete: () => {
        if (this.isHapticsEnabled()) this.callbacks.onHaptic();
        this.nextStep();
      },
    });
  }

  // --- Internal: Double-inhale steps ---

  private startDoubleInhaleStep(): void {
    const exercise = this.currentExercise();
    const step = exercise.seq[this.seqIndex];
    const [firstDur, pauseDur, secondDur] = (step.value as number[] | undefined) ?? [1.5, 0.3, 1.5];

    this.callbacks.onStateChange({
      label: 'inhale',
      sublabel: '',
      isBreathing: true,
      isText: false,
      isHIE: false,
    });

    // Phase 0: first inhale — animate 0 → 0.7
    if (this.isSoundEnabled()) {
      this.callbacks.onPlaySound('inhale');
    }
    this.callbacks.onAnimateBreath(0.7, firstDur);

    // Phase 1: pause
    this.scheduler.addJob(
      firstDur * 1000,
      () => {
        if (this.isHapticsEnabled()) this.callbacks.onVibrate(200);
        this.callbacks.onStateChange({
          label: 'hold',
          sublabel: '',
          isBreathing: true,
          isText: false,
          isHIE: false,
        });
      },
      { priority: 1, label: 'Double-inhale pause' },
    );

    // Phase 2: second inhale — animate 0.7 → 1.0
    this.scheduler.addJob(
      (firstDur + pauseDur) * 1000,
      () => {
        if (this.isSoundEnabled()) {
          this.callbacks.onPlaySound('inhale');
        }
        this.callbacks.onAnimateBreath(1, secondDur);
        this.callbacks.onStateChange({
          label: 'inhale',
          sublabel: '',
          isBreathing: true,
          isText: false,
          isHIE: false,
        });
      },
      { priority: 1, label: 'Double-inhale second' },
    );

    // Completion
    const totalDur = firstDur + pauseDur + secondDur;
    this.scheduler.addJob(
      totalDur * 1000,
      () => {
        if (this.isHapticsEnabled()) this.callbacks.onHaptic();
        this.nextStep();
      },
      { priority: 2, label: 'Double-inhale done' },
    );
  }

  // --- Internal: Text steps ---

  private startTextStep(): void {
    const exercise = this.currentExercise();
    const step = exercise.seq[this.seqIndex];
    const count = this.getEffectiveCount(step);
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
          isHIE: false,
        });
      },
      onComplete: () => {
        if (this.isHapticsEnabled()) this.callbacks.onHaptic();
        this.nextStep();
      },
    });
  }

  // --- Helpers ---

  private isSoundEnabled(): boolean {
    return this.options.isSoundEnabled?.() ?? false;
  }

  private isHapticsEnabled(): boolean {
    return this.options.isHapticsEnabled?.() ?? true;
  }
}
