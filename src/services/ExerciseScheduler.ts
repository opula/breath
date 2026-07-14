import {pick, takeWhile} from 'lodash';
import {BehaviorSubject, interval, type Subscription} from 'rxjs';

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
  private tickSub: Subscription | null = null;

  constructor() {
    this.internalTimer = 0;

    this.timerSubject.subscribe(timer => {
      const scheduledJobs = takeWhile(
        this.jobQueue,
        job => job.executionTs <= timer,
      );
      this.jobQueue = this.jobQueue.slice(scheduledJobs.length);

      scheduledJobs.forEach(job => {
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

  // The 100ms tick only runs while a session is active — an idle app keeps no
  // permanent timer waking the JS thread.
  private startTicking() {
    if (this.tickSub) return;
    this.tickSub = interval(INTERVAL_TIME).subscribe(() => {
      this.internalTimer += 100;
      this.timerSubject.next(this.internalTimer);
    });
  }

  private stopTicking() {
    this.tickSub?.unsubscribe();
    this.tickSub = null;
  }

  public start() {
    this.isActive = true;
    this.startTicking();
  }

  public stop() {
    this.isActive = false;
    this.stopTicking();
  }

  public toggle() {
    if (this.isActive) this.stop();
    else this.start();
  }

  public active() {
    return this.isActive;
  }

  public reset() {
    this.clearJobs();
    this.isActive = false;
    this.stopTicking();
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
    this.insertJob({
      executionTs: this.internalTimer + time,
      cb: callback,
      priority,
      repeat,
      label,
    });
  }

  // Ordered insert by (executionTs, priority), after equal keys — matching the
  // stable sortBy this replaces without re-sorting the queue on every add.
  private insertJob(job: JobQueueItem) {
    let lo = 0;
    let hi = this.jobQueue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const other = this.jobQueue[mid];
      if (
        other.executionTs < job.executionTs ||
        (other.executionTs === job.executionTs &&
          (other.priority ?? 0) <= (job.priority ?? 0))
      ) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.jobQueue.splice(lo, 0, job);
  }

  public clearJobs() {
    this.jobQueue = [];
  }
}

export const exerciseScheduler = new ExerciseScheduler();
