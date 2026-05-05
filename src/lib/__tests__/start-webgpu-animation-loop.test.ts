import { startWebGPUAnimationLoop } from "../start-webgpu-animation-loop";

describe("startWebGPUAnimationLoop", () => {
  it("renders the first frame and throttles subsequent frames to the target FPS", async () => {
    let loop: ((time?: number) => void) | null = null;
    const renderer = {
      init: jest.fn().mockResolvedValue(undefined),
      setAnimationLoop: jest.fn(
        (callback: ((time?: number) => void) | null) => {
          loop = callback;
        },
      ),
    };
    const animate = jest.fn();
    const onReady = jest.fn();

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => false,
      label: "test",
      onReady,
      targetFps: 30,
    });

    await Promise.resolve();

    loop?.(0);
    loop?.(10);
    loop?.(34);

    expect(animate).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("does not attach an animation loop after disposal during init", async () => {
    const renderer = {
      init: jest.fn().mockResolvedValue(undefined),
      setAnimationLoop: jest.fn(),
    };

    startWebGPUAnimationLoop(renderer, jest.fn(), {
      isDisposed: () => true,
      label: "test",
    });

    await Promise.resolve();

    expect(renderer.setAnimationLoop).not.toHaveBeenCalled();
  });
});
