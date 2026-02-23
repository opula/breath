import { ExerciseEngine } from '../index';
import type { Exercise } from '../../../types/exercise';
import type {
  ExerciseEngineCallbacks,
  ExerciseEngineOptions,
  SchedulerLike,
  EngineState,
} from '../types';

// --- Test helpers ---

function createMockScheduler(): SchedulerLike & {
  jobs: Array<{ time: number; cb: () => void; options: any }>;
  isRunning: boolean;
  runJobsAt(timeMs: number): void;
  runAllJobs(maxIterations?: number): void;
  runNextJob(): void;
} {
  const self = {
    jobs: [] as Array<{ time: number; cb: () => void; options: any }>,
    isRunning: false,

    start() { self.isRunning = true; },
    stop() { self.isRunning = false; },
    toggle() { self.isRunning = !self.isRunning; },
    active() { return self.isRunning; },
    reset() {
      self.jobs = [];
      self.isRunning = false;
    },
    clearJobs() { self.jobs = []; },
    addJob(time: number, cb: () => void, options: any) {
      if (!self.isRunning) return;
      self.jobs.push({ time, cb, options });
      self.jobs.sort((a, b) => a.time - b.time || (a.options.priority ?? 0) - (b.options.priority ?? 0));
    },

    runJobsAt(timeMs: number) {
      const due = self.jobs.filter((j) => j.time <= timeMs);
      self.jobs = self.jobs.filter((j) => j.time > timeMs);
      due.sort((a, b) => a.time - b.time || (a.options.priority ?? 0) - (b.options.priority ?? 0));
      due.forEach((j) => j.cb());
    },

    runAllJobs(maxIterations = 200) {
      let i = 0;
      while (self.jobs.length > 0 && i < maxIterations) {
        const next = self.jobs.shift()!;
        next.cb();
        self.jobs.sort((a, b) => a.time - b.time || (a.options.priority ?? 0) - (b.options.priority ?? 0));
        i++;
      }
    },

    runNextJob() {
      if (self.jobs.length === 0) return;
      const next = self.jobs.shift()!;
      next.cb();
      self.jobs.sort((a, b) => a.time - b.time || (a.options.priority ?? 0) - (b.options.priority ?? 0));
    },
  };
  return self;
}

function createMockCallbacks(): ExerciseEngineCallbacks & {
  states: EngineState[];
  sounds: string[];
  vibrations: (number | number[])[];
  breathAnimations: Array<{ target: 0 | 1; durationSec: number }>;
  hapticCount: number;
  pauseChanges: boolean[];
  repeatChanges: ({ round: number; total: number } | null)[];
} {
  const mock = {
    states: [] as EngineState[],
    sounds: [] as string[],
    vibrations: [] as (number | number[])[],
    breathAnimations: [] as Array<{ target: 0 | 1; durationSec: number }>,
    hapticCount: 0,
    pauseChanges: [] as boolean[],
    repeatChanges: [] as ({ round: number; total: number } | null)[],

    onStateChange(state: EngineState) { mock.states.push({ ...state }); },
    onPlaySound(type: any) { mock.sounds.push(type); },
    onVibrate(pattern: number | number[]) { mock.vibrations.push(pattern); },
    onAnimateBreath(target: 0 | 1, durationSec: number) {
      mock.breathAnimations.push({ target, durationSec });
    },
    onHaptic() { mock.hapticCount++; },
    onPauseChange(isPaused: boolean) { mock.pauseChanges.push(isPaused); },
    onRepeatChange(info: { round: number; total: number } | null) { mock.repeatChanges.push(info); },
  };
  return mock;
}

// --- Test exercises ---

const simpleBreathExercise: Exercise = {
  id: 'test-breath',
  name: 'Simple Breath',
  seq: [
    { id: 's1', type: 'breath', value: [2, 0, 2, 0], count: 2 },
  ],
  loopable: true,
};

const hieExercise: Exercise = {
  id: 'test-hie',
  name: 'HIE Test',
  seq: [
    { id: 's1', type: 'inhale', count: 3 },
    { id: 's2', type: 'hold', count: 2 },
    { id: 's3', type: 'exhale', count: 3 },
  ],
  loopable: true,
};

const textExercise: Exercise = {
  id: 'test-text',
  name: 'Text Test',
  seq: [
    { id: 's1', type: 'text', text: 'Focus on your breath', count: 0 },
    { id: 's2', type: 'breath', value: [3, 0, 3, 0], count: 1 },
  ],
  loopable: true,
};

const nonLoopableExercise: Exercise = {
  id: 'test-noloop',
  name: 'Non-Loopable',
  seq: [
    { id: 's1', type: 'inhale', count: 2 },
    { id: 's2', type: 'hold', count: 2 },
    { id: 's3', type: 'exhale', count: 2 },
  ],
  loopable: false,
};

const mixedExercise: Exercise = {
  id: 'test-mixed',
  name: 'Mixed',
  seq: [
    { id: 's1', type: 'breath', value: [2, 0, 2, 0], count: 1 },
    { id: 's2', type: 'hold', count: 3 },
  ],
  loopable: true,
};

const infiniteHoldExercise: Exercise = {
  id: 'test-inf-hold',
  name: 'Infinite Hold',
  seq: [
    { id: 's1', type: 'hold', count: 0 },
  ],
  loopable: true,
};

// --- Tests ---

describe('ExerciseEngine', () => {
  describe('construction', () => {
    it('creates with default exercise index 0', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleBreathExercise], scheduler, callbacks);

      expect(engine.getExerciseName()).toBe('Simple Breath');
      expect(engine.getExerciseIndex()).toBe(0);
    });

    it('uses getInitialExerciseIndex option', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine(
        [simpleBreathExercise, hieExercise],
        scheduler,
        callbacks,
        { getInitialExerciseIndex: () => 1 },
      );

      expect(engine.getExerciseName()).toBe('HIE Test');
    });
  });

  describe('start', () => {
    it('starts the scheduler and emits pauseChange(false)', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();

      expect(scheduler.isRunning).toBe(true);
      expect(callbacks.pauseChanges).toContain(false);
    });

    it('advances to the first sequence step', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();

      // First step is 'inhale', should see state change
      expect(callbacks.states.length).toBeGreaterThan(0);
      const lastState = callbacks.states[callbacks.states.length - 1];
      expect(lastState.label).toBe('inhale');
    });
  });

  describe('HIE step progression', () => {
    it('progresses through inhale → hold → exhale', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks, {
        isSoundEnabled: () => true,
      });

      engine.start();

      // First step: inhale (count=3)
      const inhaleState = callbacks.states.find((s) => s.label === 'inhale');
      expect(inhaleState).toBeDefined();
      expect(callbacks.sounds).toContain('inhale');

      // Run all jobs to completion — should advance through all 3 steps
      scheduler.runAllJobs();

      const labels = callbacks.states.map((s) => s.label);
      expect(labels).toContain('inhale');
      expect(labels).toContain('hold');
      expect(labels).toContain('exhale');
    });

    it('plays sounds for each HIE type when enabled', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks, {
        isSoundEnabled: () => true,
      });

      engine.start();
      scheduler.runAllJobs();

      expect(callbacks.sounds).toContain('inhale');
      expect(callbacks.sounds).toContain('hold');
      expect(callbacks.sounds).toContain('exhale');
    });

    it('does not play sounds when disabled', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks, {
        isSoundEnabled: () => false,
      });

      engine.start();
      scheduler.runAllJobs();

      expect(callbacks.sounds).toEqual([]);
    });

    it('triggers haptic on step completion', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();
      scheduler.runAllJobs();

      // Each HIE step completes with a haptic, plus looping reset haptic
      expect(callbacks.hapticCount).toBeGreaterThan(0);
    });
  });

  describe('breathing pattern', () => {
    it('starts breathing with correct initial state', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleBreathExercise], scheduler, callbacks);

      engine.start();

      const breathState = callbacks.states.find((s) => s.isBreathing);
      expect(breathState).toBeDefined();
      expect(breathState!.label).toBe('inhale');
    });

    it('animates breath in on inhale phase', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleBreathExercise], scheduler, callbacks);

      engine.start();

      // The first breath phase job animates to 1
      scheduler.runJobsAt(0);
      const animateIn = callbacks.breathAnimations.find((a) => a.target === 1);
      expect(animateIn).toBeDefined();
      expect(animateIn!.durationSec).toBe(2);
    });

    it('skips zero-duration breath phases', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      // [2, 0, 2, 0] — hold phases are 0, should be skipped
      const engine = new ExerciseEngine([simpleBreathExercise], scheduler, callbacks);

      engine.start();
      // After inhale (2s), the hold (0s) should be skipped,
      // going straight to exhale
      scheduler.runAllJobs();

      const labels = callbacks.states
        .filter((s) => s.isBreathing)
        .map((s) => s.label);
      // Should have inhale and exhale, hold gets skipped
      expect(labels).toContain('inhale');
      expect(labels).toContain('exhale');
    });

    it('tracks pattern count in sublabel', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleBreathExercise], scheduler, callbacks);

      engine.start();

      const firstBreathState = callbacks.states.find((s) => s.isBreathing);
      expect(firstBreathState?.sublabel).toMatch(/n°/);
    });
  });

  describe('text steps', () => {
    it('displays text label and sets isText', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([textExercise], scheduler, callbacks);

      engine.start();

      const textState = callbacks.states.find((s) => s.isText);
      expect(textState).toBeDefined();
      expect(textState!.label).toBe('Focus on your breath');
    });
  });

  describe('advance (user tap)', () => {
    it('starts exercise when not yet started', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      expect(engine.isStarted()).toBe(false);
      engine.advance();
      expect(engine.isStarted()).toBe(true);
      expect(callbacks.pauseChanges).toContain(false);
    });

    it('toggles pause when paused', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();
      // Pause by toggling
      scheduler.stop();
      callbacks.pauseChanges.length = 0;

      engine.advance();
      // Should have toggled
      expect(callbacks.hapticCount).toBeGreaterThan(0);
    });

    it('advances on count===0 step', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([infiniteHoldExercise], scheduler, callbacks);

      engine.start();
      const statesBefore = callbacks.states.length;

      engine.advance();

      // Should have triggered haptic and cleared jobs
      expect(callbacks.hapticCount).toBeGreaterThan(0);
    });

    it('does nothing on count>0 step', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();
      const jobsBefore = scheduler.jobs.length;

      engine.advance(); // inhale has count=3, should not advance
      // Jobs should not have been cleared
      expect(scheduler.jobs.length).toBe(jobsBefore);
    });
  });

  describe('nextExercise', () => {
    it('wraps forward through exercises', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const exercises = [simpleBreathExercise, hieExercise, textExercise];
      const engine = new ExerciseEngine(exercises, scheduler, callbacks);

      expect(engine.getExerciseIndex()).toBe(0);
      engine.nextExercise(1);
      expect(engine.getExerciseIndex()).toBe(1);
      engine.nextExercise(1);
      expect(engine.getExerciseIndex()).toBe(2);
      engine.nextExercise(1);
      expect(engine.getExerciseIndex()).toBe(0); // wraps
    });

    it('wraps backward through exercises', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const exercises = [simpleBreathExercise, hieExercise];
      const engine = new ExerciseEngine(exercises, scheduler, callbacks);

      engine.nextExercise(-1);
      expect(engine.getExerciseIndex()).toBe(1); // wraps to end
    });

    it('stops current exercise when in progress', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const exercises = [simpleBreathExercise, hieExercise];
      const engine = new ExerciseEngine(exercises, scheduler, callbacks);

      engine.start();
      engine.nextExercise(1);

      // Should have reset (andStop=true)
      expect(callbacks.pauseChanges).toContain(true);
    });

    it('saves exercise index via option callback', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const save = jest.fn();
      const engine = new ExerciseEngine(
        [simpleBreathExercise, hieExercise],
        scheduler,
        callbacks,
        { saveExerciseIndex: save },
      );

      engine.nextExercise(1);
      expect(save).toHaveBeenCalledWith(1);
    });
  });

  describe('reset', () => {
    it('resets scheduler and state', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();
      engine.reset(true);

      expect(scheduler.isRunning).toBe(false);
      const lastState = callbacks.states[callbacks.states.length - 1];
      expect(lastState.label).toBe('');
      expect(lastState.isBreathing).toBe(false);
    });

    it('reset without andStop restarts the exercise', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();
      engine.reset();

      expect(scheduler.isRunning).toBe(true);
      expect(callbacks.pauseChanges).toContain(false);
    });

    it('fires haptic on reset', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();
      callbacks.hapticCount = 0;
      engine.reset(true);

      expect(callbacks.hapticCount).toBe(1);
    });
  });

  describe('non-loopable exercise', () => {
    it('resets when reaching end of sequence', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([nonLoopableExercise], scheduler, callbacks);

      engine.start();
      // Run through all 3 steps — inhale, hold, exhale
      scheduler.runAllJobs();

      // After all steps, it should have reset and restarted (non-loopable wraps → reset)
      // The engine calls reset() which restarts, then runs through again
      // Check that it eventually processed all three types
      const labels = callbacks.states.map((s) => s.label);
      expect(labels).toContain('inhale');
      expect(labels).toContain('hold');
      expect(labels).toContain('exhale');
    });
  });

  describe('mixed exercise (breath + HIE)', () => {
    it('transitions from breath pattern to HIE step', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([mixedExercise], scheduler, callbacks);

      engine.start();
      scheduler.runAllJobs();

      const labels = callbacks.states.map((s) => s.label);
      // Should contain breath labels and then 'hold'
      expect(labels).toContain('inhale');
      expect(labels).toContain('hold');
    });

    it('vibrate pattern changes for breath→HIE transition', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([mixedExercise], scheduler, callbacks);

      engine.start();
      scheduler.runAllJobs();

      // When transitioning from breath to non-breath, should use [300, 300]
      const doubleVibrate = callbacks.vibrations.find(
        (v) => Array.isArray(v) && v.length === 2,
      );
      expect(doubleVibrate).toEqual([300, 300]);
    });
  });

  describe('destroy', () => {
    it('prevents further operations', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.destroy();
      const statesBefore = callbacks.states.length;

      engine.start();
      expect(callbacks.states.length).toBe(statesBefore);
    });

    it('resets scheduler on destroy', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start();
      engine.destroy();

      expect(scheduler.isRunning).toBe(false);
    });
  });

  describe('updateExercises', () => {
    it('updates the exercises list', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      expect(engine.getExerciseName()).toBe('HIE Test');

      engine.updateExercises([textExercise]);
      expect(engine.getExerciseName()).toBe('Text Test');
    });
  });

  describe('ramp', () => {
    const breathWithRamp: Exercise = {
      id: 'test-breath-ramp',
      name: 'Breath Ramp',
      seq: [
        { id: 's1', type: 'breath', value: [1, 0, 1, 0], count: 2, ramp: 1.5 },
      ],
      loopable: true,
    };

    const hieWithRamp: Exercise = {
      id: 'test-hie-ramp',
      name: 'HIE Ramp',
      seq: [
        { id: 's1', type: 'hold', count: 10, ramp: 1.1 },
      ],
      loopable: true,
    };

    const infiniteWithRamp: Exercise = {
      id: 'test-inf-ramp',
      name: 'Infinite Ramp',
      seq: [
        { id: 's1', type: 'hold', count: 0, ramp: 2.0 },
      ],
      loopable: true,
    };

    const rampOne: Exercise = {
      id: 'test-ramp-one',
      name: 'Ramp One',
      seq: [
        { id: 's1', type: 'hold', count: 10, ramp: 1.0 },
      ],
      loopable: true,
    };

    const nonLoopableRamp: Exercise = {
      id: 'test-noloop-ramp',
      name: 'Non-Loopable Ramp',
      seq: [
        { id: 's1', type: 'hold', count: 10, ramp: 1.5 },
      ],
      loopable: false,
    };

    it('breath step with ramp > 1 uses increased count on second loop', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([breathWithRamp], scheduler, callbacks);

      engine.start();
      expect(engine.getSequenceLoop()).toBe(0);

      // First loop: count = Math.round(2 * (1 + 0 * 0.5)) = 2
      const firstSublabel = callbacks.states.find((s) => s.isBreathing)?.sublabel;
      expect(firstSublabel).toBe('n° 2');

      // Run until exactly one wrap occurs
      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      expect(engine.getSequenceLoop()).toBe(1);

      // Second loop: count = Math.round(2 * (1 + 1 * 0.5)) = 3
      const secondLoopStates = callbacks.states.filter((s) => s.isBreathing);
      const lastBreathStart = secondLoopStates[secondLoopStates.length - 1];
      expect(lastBreathStart?.sublabel).toMatch(/n° 3/);
    });

    it('HIE step with ramp > 1 uses increased count on second loop', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieWithRamp], scheduler, callbacks);

      engine.start();

      // First loop: effectiveCount = Math.round(10 * (1 + 0 * 0.1)) = 10
      // First tick sets sublabel to padded count
      const firstHIETick = callbacks.states.find((s) => s.isHIE && s.sublabel !== '');
      expect(firstHIETick).toBeDefined();
      expect(firstHIETick!.sublabel).toBe('10');

      // Run until exactly one wrap occurs
      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      expect(engine.getSequenceLoop()).toBe(1);

      // Second loop: effectiveCount = Math.round(10 * (1 + 1 * 0.1)) = 11
      const allHIE = callbacks.states.filter((s) => s.isHIE);
      const secondLoopSublabels = allHIE.filter((s) => s.sublabel === '11');
      expect(secondLoopSublabels.length).toBeGreaterThan(0);
    });

    it('step with count=0 ignores ramp', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([infiniteWithRamp], scheduler, callbacks);

      engine.start();

      // count=0 means infinite — ramp should not change it
      expect(engine.canAdvance()).toBe(true);
    });

    it('ramp=1.0 has no effect', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([rampOne], scheduler, callbacks);

      engine.start();

      // First loop: effectiveCount should still be 10
      const firstHIETick = callbacks.states.find((s) => s.isHIE && s.sublabel !== '');
      expect(firstHIETick!.sublabel).toBe('10');

      // Run until one wrap
      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      // Second loop sublabel should still start at 10 (ramp=1.0 has no effect)
      const allHIE = callbacks.states.filter((s) => s.isHIE);
      const lastHIE = allHIE[allHIE.length - 1];
      expect(lastHIE.sublabel).toBe('10');
    });

    it('reset(true) resets sequenceLoop, natural wrap preserves it', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieWithRamp], scheduler, callbacks);

      engine.start();

      // Run until one wrap occurs
      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      expect(engine.getSequenceLoop()).toBeGreaterThan(0);

      // reset(true) should zero it out
      engine.reset(true);
      expect(engine.getSequenceLoop()).toBe(0);
    });

    it('non-loopable exercise preserves sequenceLoop on natural wrap', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([nonLoopableRamp], scheduler, callbacks);

      engine.start();

      // Run until one wrap occurs (non-loopable calls reset() without andStop)
      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      // sequenceLoop should be preserved (incremented on wrap, not reset by reset())
      expect(engine.getSequenceLoop()).toBeGreaterThan(0);
    });
  });

  describe('repeat step', () => {
    // double-inhale(0) → exhale(1) → repeat(2, lookback=2, count=3) → hold(3)
    const bellowExercise: Exercise = {
      id: 'test-bellow',
      name: 'Bellow',
      seq: [
        { id: 's1', type: 'double-inhale', value: [1, 0.1, 1], count: 0 },
        { id: 's2', type: 'exhale', count: 2 },
        { id: 's3', type: 'repeat', value: [2], count: 3 },
        { id: 's4', type: 'hold', count: 5 },
      ],
      loopable: true,
    };

    // inhale(0) → repeat(1, lookback=1, count=4)
    const simpleRepeat: Exercise = {
      id: 'test-simple-repeat',
      name: 'Simple Repeat',
      seq: [
        { id: 's1', type: 'inhale', count: 2 },
        { id: 's2', type: 'repeat', value: [1], count: 4 },
      ],
      loopable: true,
    };

    // inhale(0) → repeat(1, lookback=1, count=1) — block already ran once, skip
    const repeatCountOne: Exercise = {
      id: 'test-repeat-one',
      name: 'Repeat One',
      seq: [
        { id: 's1', type: 'inhale', count: 2 },
        { id: 's2', type: 'repeat', value: [1], count: 1 },
        { id: 's3', type: 'hold', count: 3 },
      ],
      loopable: true,
    };

    // inhale(0) → hold(1) → repeat(2, lookback=2, count=2) — non-loopable
    const nonLoopableRepeat: Exercise = {
      id: 'test-noloop-repeat',
      name: 'Non-Loopable Repeat',
      seq: [
        { id: 's1', type: 'inhale', count: 1 },
        { id: 's2', type: 'hold', count: 1 },
        { id: 's3', type: 'repeat', value: [2], count: 2 },
      ],
      loopable: false,
    };

    it('repeats the block the correct number of times', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleRepeat], scheduler, callbacks);

      engine.start();
      // count=4 means 4 total: 1 initial + 3 from repeat
      // Track how many times 'inhale' state appears (each run starts with an inhale state)
      scheduler.runAllJobs();

      const inhaleStates = callbacks.states.filter(
        (s) => s.label === 'inhale' && s.isHIE === false && s.isBreathing === false,
      );
      // inhale HIE steps produce isHIE=true; let's just count all inhale labels
      const allInhale = callbacks.states.filter((s) => s.label === 'inhale');
      // 4 iterations of the block + at least 1 more from the loop wrap
      expect(allInhale.length).toBeGreaterThanOrEqual(4);
    });

    it('advances past repeat step to subsequent steps', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([bellowExercise], scheduler, callbacks);

      engine.start();
      scheduler.runAllJobs();

      // After repeat block completes, should reach the hold step
      const holdStates = callbacks.states.filter((s) => s.label === 'hold' && s.isHIE);
      expect(holdStates.length).toBeGreaterThan(0);
    });

    it('count=1 skips repeat (block already ran once)', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([repeatCountOne], scheduler, callbacks);

      engine.start();

      // Run until we see a 'hold' label (which comes after the skipped repeat)
      let iterations = 0;
      while (iterations < 50 && scheduler.jobs.length > 0) {
        const holdSeen = callbacks.states.some((s) => s.label === 'hold');
        if (holdSeen) break;
        scheduler.runNextJob();
        iterations++;
      }

      // Should see inhale then hold (repeat with count=1 is a no-op)
      const allLabels = callbacks.states.map((s) => s.label);
      expect(allLabels).toContain('inhale');
      expect(allLabels).toContain('hold');

      // Count distinct step transitions to inhale before hold appears.
      // A step transition is when the label changes TO 'inhale' from something else.
      let inhaleStepCount = 0;
      for (let i = 0; i < allLabels.length; i++) {
        if (allLabels[i] === 'hold') break;
        if (allLabels[i] === 'inhale' && (i === 0 || allLabels[i - 1] !== 'inhale')) {
          inhaleStepCount++;
        }
      }
      expect(inhaleStepCount).toBe(1);
    });

    it('plays block steps in order during repeat', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([bellowExercise], scheduler, callbacks);

      engine.start();

      // Run until we see the hold step (which comes after the repeat block)
      let iterations = 0;
      while (iterations < 200 && scheduler.jobs.length > 0) {
        const holdSeen = callbacks.states.some((s) => s.label === 'hold' && s.isHIE);
        if (holdSeen) break;
        scheduler.runNextJob();
        iterations++;
      }

      // Count distinct exhale step transitions before the HIE hold
      // Each exhale step starts with a transition from non-exhale to exhale
      const holdIndex = callbacks.states.findIndex((s) => s.label === 'hold' && s.isHIE);
      const preHoldLabels = callbacks.states.slice(0, holdIndex).map((s) => s.label);

      let exhaleStepCount = 0;
      for (let i = 0; i < preHoldLabels.length; i++) {
        if (preHoldLabels[i] === 'exhale' && (i === 0 || preHoldLabels[i - 1] !== 'exhale')) {
          exhaleStepCount++;
        }
      }

      // count=3 → 3 total: 1 initial pass + 2 from repeat (remaining = 3-1 = 2)
      expect(exhaleStepCount).toBe(3);
    });

    it('reset clears repeat state', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([bellowExercise], scheduler, callbacks);

      engine.start();
      // Run a few jobs into the repeat block
      scheduler.runNextJob();
      scheduler.runNextJob();

      engine.reset(true);

      // After reset, starting again should work from step 0
      engine.start();
      const lastState = callbacks.states[callbacks.states.length - 1];
      expect(lastState.label).toBe('inhale'); // double-inhale starts with 'inhale'
    });

    it('non-loopable exercise resets after repeat block ends at seq boundary', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([nonLoopableRepeat], scheduler, callbacks);

      engine.start();
      scheduler.runAllJobs();

      // After repeat finishes at end of seq, non-loopable should reset
      // Check that it processed inhale and hold
      const labels = callbacks.states.map((s) => s.label);
      expect(labels).toContain('inhale');
      expect(labels).toContain('hold');
    });

    it('onRepeatChange fires with round 1 at repeat start', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleRepeat], scheduler, callbacks);

      engine.start();

      // simpleRepeat: inhale(count=2) → repeat(lookback=1, count=4)
      // After the first inhale completes the repeat step is encountered
      // Run until repeat is set up
      while (scheduler.jobs.length > 0 && callbacks.repeatChanges.length === 0) {
        scheduler.runNextJob();
      }

      expect(callbacks.repeatChanges.length).toBeGreaterThanOrEqual(1);
      expect(callbacks.repeatChanges[0]).toEqual({ round: 1, total: 4 });
    });

    it('onRepeatChange round increments on each block completion', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleRepeat], scheduler, callbacks);

      engine.start();

      // Run through all repeat iterations
      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      // count=4: round 1 at setup, round 2 after first block end, round 3, then null when done
      const nonNull = callbacks.repeatChanges.filter((c) => c !== null);
      expect(nonNull).toEqual([
        { round: 1, total: 4 },
        { round: 2, total: 4 },
        { round: 3, total: 4 },
      ]);
    });

    it('onRepeatChange fires null when repeat finishes', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([simpleRepeat], scheduler, callbacks);

      engine.start();

      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      // Last repeat change before the loop wraps should be null
      const lastRepeatChange = callbacks.repeatChanges.filter(
        (c, i) => i < callbacks.repeatChanges.length && c === null,
      );
      expect(lastRepeatChange.length).toBeGreaterThan(0);
    });

    it('onRepeatChange fires null on reset', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([bellowExercise], scheduler, callbacks);

      engine.start();
      // Run a few jobs to get into the repeat block
      scheduler.runNextJob();
      scheduler.runNextJob();

      callbacks.repeatChanges.length = 0;
      engine.reset(true);

      expect(callbacks.repeatChanges).toContain(null);
    });

    it('ramp affects repeat count', () => {
      const rampedRepeat: Exercise = {
        id: 'test-ramp-repeat',
        name: 'Ramped Repeat',
        seq: [
          { id: 's1', type: 'inhale', count: 1 },
          { id: 's2', type: 'repeat', value: [1], count: 4, ramp: 1.5 },
        ],
        loopable: true,
      };

      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([rampedRepeat], scheduler, callbacks);

      engine.start();

      // First loop: effectiveCount = 4 (ramp on loop 0 = no change)
      // Count inhale states in first loop
      while (engine.getSequenceLoop() === 0 && scheduler.jobs.length > 0) {
        scheduler.runNextJob();
      }

      // Should have wrapped at least once
      expect(engine.getSequenceLoop()).toBeGreaterThanOrEqual(1);

      // Count total inhale labels emitted (first loop: 4 total = 1 initial + 3 repeated)
      const inhaleCount = callbacks.states.filter((s) => s.label === 'inhale').length;
      expect(inhaleCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('queries', () => {
    it('isActive reflects scheduler state', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      expect(engine.isActive()).toBe(false);
      engine.start();
      expect(engine.isActive()).toBe(true);
    });

    it('canAdvance returns true when not started', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      expect(engine.canAdvance()).toBe(true);
    });

    it('canAdvance returns false on count>0 step', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      engine.start(); // now on inhale with count=3
      expect(engine.canAdvance()).toBe(false);
    });

    it('isStarted tracks sequence state', () => {
      const scheduler = createMockScheduler();
      const callbacks = createMockCallbacks();
      const engine = new ExerciseEngine([hieExercise], scheduler, callbacks);

      expect(engine.isStarted()).toBe(false);
      engine.start();
      expect(engine.isStarted()).toBe(true);
    });
  });
});
