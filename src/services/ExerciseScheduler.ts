import {pick, sortBy, takeWhile} from 'lodash';
import {BehaviorSubject, filter, interval} from 'rxjs';

const INTERVAL_TIME = 100;

type JobQueueItem = {
  executionTs: number;
  cb: () => void;
  priority?: number;
  repeat?: number;
  label?: string;
};

class ExerciseScheduler {
  private internalTimer: number;
  private isActive = false;
  private jobQueue: JobQueueItem[] = [];
  private timerSubject = new BehaviorSubject<number>(0);

  constructor() {
    this.internalTimer = 0;

    interval(INTERVAL_TIME)
      .pipe(filter(() => this.isActive))
      .subscribe(() => {
        this.internalTimer += 100;
        this.timerSubject.next(this.internalTimer);
      });

    this.timerSubject.subscribe(timer => {
      const scheduledJobs = takeWhile(
        this.jobQueue,
        job => job.executionTs <= timer,
      );
      this.jobQueue = this.jobQueue.slice(scheduledJobs.length);

      scheduledJobs.forEach(job => {
        // if (job.label) {
        //   console.log('Calling', job.label);
        // }

        job.cb();

        if (job.repeat) {
          this.addJob(
            job.repeat,
            job.cb,
            pick(job, ['priority', 'label', 'repeat']),
          );
        }
      });
    });
  }

  public start() {
    this.isActive = true;
  }

  public stop() {
    this.isActive = false;
  }

  public toggle() {
    this.isActive = !this.isActive;
  }

  public active() {
    return this.isActive;
  }

  public reset() {
    this.clearJobs();
    this.isActive = false;
    this.internalTimer = 0;
  }

  public addJob(
    time: number,
    callback: () => void,
    options: {
      priority?: number;
      repeat?: number;
      label?: string;
    },
  ) {
    if (!this.isActive) return;

    const {priority = 0, repeat = 0, label = ''} = options;
    this.jobQueue.push({
      executionTs: this.internalTimer + time,
      cb: callback,
      priority,
      repeat,
      label,
    });

    this.jobQueue = sortBy(this.jobQueue, ['executionTs', 'priority']);
  }

  public clearJobs() {
    this.jobQueue = [];
  }
}

export const exerciseScheduler = new ExerciseScheduler();
