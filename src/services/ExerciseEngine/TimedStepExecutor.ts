import { padStart } from 'lodash';
import type { SchedulerLike, TimedStepConfig } from './types';

/**
 * Handles countdown (count > 0) and count-up (count === 0) step execution.
 * Deduplicates the identical pattern used by HIE steps and TEXT steps.
 */
export class TimedStepExecutor {
  private scheduler: SchedulerLike;

  constructor(scheduler: SchedulerLike) {
    this.scheduler = scheduler;
  }

  execute(config: TimedStepConfig): void {
    const { label, count, onTick, onComplete } = config;

    onTick(count ? padStart(`${count}`, 2, '0') : padStart('0', 2, '0'));

    if (count) {
      this.scheduleCountdown(count, onTick, onComplete);
    } else {
      this.scheduleCountUp(onTick);
    }
  }

  private scheduleCountdown(
    count: number,
    onTick: (sublabel: string) => void,
    onComplete: () => void,
  ): void {
    for (let t = 1; t <= count; t++) {
      this.scheduler.addJob(
        t * 1000,
        () => {
          onTick(padStart(`${count - t}`, 2, '0'));
        },
        { priority: 0, label: 'Countdown' },
      );
    }

    this.scheduler.addJob(
      count * 1000,
      onComplete,
      { priority: 1, label: 'Next Seq' },
    );
  }

  private scheduleCountUp(onTick: (sublabel: string) => void): void {
    let counter = 0;
    this.scheduler.addJob(
      1000,
      () => {
        counter++;
        onTick(padStart(`${counter}`, 2, '0'));
      },
      { priority: 0, label: 'Count up, inf', repeat: 1000 },
    );
  }
}
