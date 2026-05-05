type WebGPUAnimationRenderer = {
  init: () => Promise<unknown>;
  setAnimationLoop: (callback: ((time?: number) => void) | null) => void;
};

interface StartWebGPUAnimationLoopOptions {
  isDisposed: () => boolean;
  label: string;
  onReady?: () => void;
  targetFps?: number;
}

export const startWebGPUAnimationLoop = (
  renderer: WebGPUAnimationRenderer,
  animate: () => void,
  {
    isDisposed,
    label,
    onReady,
    targetFps = 30,
  }: StartWebGPUAnimationLoopOptions,
) => {
  let hasPresentedFrame = false;
  let lastFrameTime: number | null = null;
  const frameInterval = 1000 / targetFps;

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
