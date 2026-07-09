type WebGPUAnimationRenderer = {
  init: () => Promise<unknown>;
  setAnimationLoop: (callback: ((time?: number) => void) | null) => void;
};

interface StartWebGPUAnimationLoopOptions {
  isDisposed: () => boolean;
  label: string;
  onReady?: () => void;
  targetFps?: number;
  logFrameStats?: boolean;
}

const STATS_WINDOW_MS = 5000;

// Latest stats line per loop label, for the dev overlay (Metro log
// forwarding is unreliable mid-session; on-screen text is always readable).
export const frameStatsFeed: { lines: Record<string, string> } = { lines: {} };

const makeFrameStatsLogger = (label: string) => {
  let windowStart: number | null = null;
  let intervals: number[] = [];
  let lastTime: number | null = null;

  return (time: number) => {
    if (frameStatsFeed.lines[label] === undefined) {
      frameStatsFeed.lines[label] = `${label} warming t=${String(time).slice(0, 10)}`;
    }
    if (lastTime !== null) {
      intervals.push(time - lastTime);
    }
    lastTime = time;
    windowStart ??= time;

    if (time - windowStart < STATS_WINDOW_MS || intervals.length === 0) {
      return;
    }
    const sorted = [...intervals].sort((a, b) => a - b);
    const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const line =
      `[frame-stats] ${label} fps=${(1000 / avg).toFixed(1)} ` +
      `avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=${intervals.length}`;
    frameStatsFeed.lines[label] = line;
    console.warn(line);
    windowStart = time;
    intervals = [];
  };
};

export const startWebGPUAnimationLoop = (
  renderer: WebGPUAnimationRenderer,
  animate: () => void,
  {
    isDisposed,
    label,
    onReady,
    targetFps = 30,
    logFrameStats = false,
  }: StartWebGPUAnimationLoopOptions,
) => {
  let hasPresentedFrame = false;
  let lastFrameTime: number | null = null;
  const frameInterval = 1000 / targetFps;
  const logStats =
    logFrameStats && __DEV__ ? makeFrameStatsLogger(label) : null;

  const animateAndMarkReady = (time = Date.now()) => {
    const elapsed = lastFrameTime === null ? Infinity : time - lastFrameTime;
    if (
      hasPresentedFrame &&
      elapsed >= 0 &&
      elapsed < frameInterval
    ) {
      return;
    }

    lastFrameTime = time;
    animate();
    logStats?.(time);
    if (!hasPresentedFrame && !isDisposed()) {
      hasPresentedFrame = true;
      onReady?.();
    }
  };

  void renderer
    .init()
    .then(() => {
      if (!isDisposed()) {
        renderer.setAnimationLoop(animateAndMarkReady);
      }
    })
    .catch((error) => {
      if (!isDisposed()) {
        console.warn(`${label} WebGPU renderer failed to initialize`, error);
      }
    });
};
