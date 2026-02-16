import { TimedStepExecutor } from '../TimedStepExecutor';
import type { SchedulerLike } from '../types';

function createMockScheduler(): SchedulerLike & {
  jobs: Array<{ time: number; cb: () => void; options: any }>;
  runAllJobs(): void;
  runJobsUpTo(timeMs: number): void;
} {
  const jobs: Array<{ time: number; cb: () => void; options: any }> = [];

  return {
    jobs,
    start: jest.fn(),
    stop: jest.fn(),
    toggle: jest.fn(),
    active: jest.fn(() => true),
    reset: jest.fn(),
    clearJobs: jest.fn(),
    addJob(time, cb, options) {
      jobs.push({ time, cb, options });
    },
    runAllJobs() {
      // Sort by time, then priority
      const sorted = [...jobs].sort(
        (a, b) => a.time - b.time || (a.options.priority ?? 0) - (b.options.priority ?? 0),
      );
      sorted.forEach((j) => j.cb());
    },
    runJobsUpTo(timeMs: number) {
      const due = jobs
        .filter((j) => j.time <= timeMs)
        .sort(
          (a, b) => a.time - b.time || (a.options.priority ?? 0) - (b.options.priority ?? 0),
        );
      due.forEach((j) => j.cb());
    },
  };
}

describe('TimedStepExecutor', () => {
  describe('countdown (count > 0)', () => {
    it('emits initial sublabel with padded count', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);
      const onTick = jest.fn();
      const onComplete = jest.fn();

      executor.execute({
        label: 'hold',
        count: 5,
        onTick,
        onComplete,
      });

      expect(onTick).toHaveBeenCalledWith('05');
    });

    it('schedules countdown jobs for each second', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);
      const onTick = jest.fn();
      const onComplete = jest.fn();

      executor.execute({
        label: 'hold',
        count: 3,
        onTick,
        onComplete,
      });

      // 3 countdown ticks + 1 completion = 4 jobs
      expect(scheduler.jobs).toHaveLength(4);
      expect(scheduler.jobs[0].time).toBe(1000);
      expect(scheduler.jobs[1].time).toBe(2000);
      expect(scheduler.jobs[2].time).toBe(3000);
      expect(scheduler.jobs[3].time).toBe(3000); // completion at same time, higher priority
    });

    it('counts down from count to 0', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);
      const ticks: string[] = [];
      const onTick = (s: string) => ticks.push(s);
      const onComplete = jest.fn();

      executor.execute({ label: 'hold', count: 3, onTick, onComplete });

      // Initial tick is synchronous
      expect(ticks).toEqual(['03']);

      // Run scheduled jobs
      scheduler.runAllJobs();
      expect(ticks).toEqual(['03', '02', '01', '00']);
    });

    it('calls onComplete after countdown finishes', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);
      const onComplete = jest.fn();

      executor.execute({ label: 'exhale', count: 2, onTick: jest.fn(), onComplete });

      scheduler.runAllJobs();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('completion job has priority 1 (runs after tick)', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);

      executor.execute({ label: 'hold', count: 1, onTick: jest.fn(), onComplete: jest.fn() });

      const completionJob = scheduler.jobs.find((j) => j.options.label === 'Next Seq');
      expect(completionJob?.options.priority).toBe(1);
    });
  });

  describe('count-up (count === 0)', () => {
    it('emits initial sublabel as "00"', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);
      const onTick = jest.fn();

      executor.execute({ label: 'hold', count: 0, onTick, onComplete: jest.fn() });

      expect(onTick).toHaveBeenCalledWith('00');
    });

    it('schedules a repeating count-up job', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);

      executor.execute({ label: 'hold', count: 0, onTick: jest.fn(), onComplete: jest.fn() });

      expect(scheduler.jobs).toHaveLength(1);
      expect(scheduler.jobs[0].options.repeat).toBe(1000);
    });

    it('increments counter on each tick', () => {
      const scheduler = createMockScheduler();
      const executor = new TimedStepExecutor(scheduler);
      const ticks: string[] = [];
      const onTick = (s: string) => ticks.push(s);

      executor.execute({ label: 'hold', count: 0, onTick, onComplete: jest.fn() });

      // Simulate repeated calls (scheduler would re-add the job)
      const job = scheduler.jobs[0];
      job.cb(); // tick 1
      job.cb(); // tick 2
      job.cb(); // tick 3

      expect(ticks).toEqual(['00', '01', '02', '03']);
    });
  });
});
