type WebGPUAnimationRenderer = {
  init: () => Promise<unknown>;
  setAnimationLoop: (callback: (() => void) | null) => void;
};

interface StartWebGPUAnimationLoopOptions {
  isDisposed: () => boolean;
  label: string;
  onReady?: () => void;
}

export const startWebGPUAnimationLoop = (
  renderer: WebGPUAnimationRenderer,
  animate: () => void,
  { isDisposed, label, onReady }: StartWebGPUAnimationLoopOptions,
) => {
  let hasPresentedFrame = false;
  const animateAndMarkReady = () => {
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
