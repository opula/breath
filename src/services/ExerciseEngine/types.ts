import type { Exercise } from '../../types/exercise';

export type SoundType = 'inhale' | 'exhale' | 'hold';

export type BreathPhaseIndex = 0 | 1 | 2 | 3;

export interface EngineState {
  label: string;
  sublabel: string;
  isBreathing: boolean;
  isText: boolean;
  isHIE: boolean;
}

export interface ExerciseEngineCallbacks {
  onStateChange(state: EngineState): void;
  onPlaySound(type: SoundType): void;
  onVibrate(pattern: number | number[]): void;
  onAnimateBreath(target: 0 | 1, durationSec: number): void;
  onHaptic(): void;
  onPauseChange(isPaused: boolean): void;
}

export interface ExerciseEngineOptions {
  getInitialExerciseIndex?: () => number;
  saveExerciseIndex?: (index: number) => void;
  isSoundEnabled?: () => boolean;
}

export interface SchedulerLike {
  start(): void;
  stop(): void;
  toggle(): void;
  active(): boolean;
  reset(): void;
  addJob(
    time: number,
    callback: () => void,
    options: { priority?: number; repeat?: number; label?: string },
  ): void;
  clearJobs(): void;
}

export interface TimedStepConfig {
  label: string;
  count: number;
  soundType?: SoundType;
  onTick: (sublabel: string) => void;
  onComplete: () => void;
}
