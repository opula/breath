type WebGPUAnimationRenderer = {
  init: () => Promise<unknown>;
  setAnimationLoop: (callback: (() => void) | null) => void;
};

interface StartWebGPUAnimationLoopOptions {
  isDisposed: () => boolean;
  label: string;
}

export const startWebGPUAnimationLoop = (
  renderer: WebGPUAnimationRenderer,
  animate: () => void,
  { isDisposed, label }: StartWebGPUAnimationLoopOptions,
) => {
  void renderer
    .init()
    .then(() => {
      if (!isDisposed()) {
        renderer.setAnimationLoop(animate);
      }
    })
    .catch((error) => {
      if (!isDisposed()) {
        console.warn(`${label} WebGPU renderer failed to initialize`, error);
      }
    });
};
