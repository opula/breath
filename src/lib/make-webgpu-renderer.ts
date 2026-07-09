// https://github.com/wcandillon/react-native-webgpu/blob/578ad989b4326724702b14245d5c82622849ee23/apps/example/src/ThreeJS/components/makeWebGPURenderer.ts#L1
import type { NativeCanvas } from "react-native-webgpu";
import * as THREE from "three/webgpu";
import { markWebGPUInitError, markWebGPUReady } from "./webgpu-ready";

// Here we need to wrap the Canvas into a non-host object for now
export class ReactNativeCanvas {
  constructor(private canvas: NativeCanvas) {}

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  set width(width: number) {
    this.canvas.width = width;
  }

  set height(height: number) {
    this.canvas.height = height;
  }

  get clientWidth() {
    return this.canvas.width;
  }

  get clientHeight() {
    return this.canvas.height;
  }

  set clientWidth(width: number) {
    this.canvas.width = width;
  }

  set clientHeight(height: number) {
    this.canvas.height = height;
  }

  addEventListener(_type: string, _listener: EventListener) {
    // TODO
  }

  removeEventListener(_type: string, _listener: EventListener) {
    // TODO
  }

  dispatchEvent(_event: Event) {
    // TODO
  }

  setPointerCapture() {
    // TODO
  }

  releasePointerCapture() {
    // TODO
  }
}

export type DawnToggles = {
  enabledToggles?: string[];
  disabledToggles?: string[];
};

export type MakeWebGPURendererOptions = {
  antialias?: boolean;
  alpha?: boolean;
  /**
   * Render at a fraction of native canvas pixels (fragment-cost lever for
   * raymarch-heavy scenes); the surface is upscaled to the view on present.
   */
  renderScale?: number;
  /** Dawn-only device toggles (e.g. skip_validation); non-portable. */
  dawnToggles?: DawnToggles;
};

export const makeWebGPURenderer = (
  context: GPUCanvasContext,
  {
    antialias = true,
    alpha = false,
    renderScale = 1,
    dawnToggles,
  }: MakeWebGPURendererOptions = {},
) => {
  if (renderScale !== 1) {
    const canvas = context.canvas as unknown as {
      width: number;
      height: number;
    };
    canvas.width = Math.max(1, Math.round(canvas.width * renderScale));
    canvas.height = Math.max(1, Math.round(canvas.height * renderScale));
  }

  const renderer = new THREE.WebGPURenderer({
    antialias,
    alpha,
    // @ts-expect-error - RN canvas doesn't match HTMLCanvasElement type
    canvas: new ReactNativeCanvas(context.canvas),
    context,
  });

  const originalInit = renderer.init.bind(renderer);

  renderer.init = async () => {
    try {
      if (dawnToggles) {
        // three uses parameters.device verbatim when provided, so request the
        // device ourselves to chain Dawn toggles onto the native descriptor.
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          const device = await adapter.requestDevice({
            requiredFeatures: [...adapter.features] as GPUFeatureName[],
            dawnToggles,
          } as GPUDeviceDescriptor);
          (
            renderer.backend as unknown as {
              parameters: { device?: GPUDevice };
            }
          ).parameters.device = device;
        }
      }
      const result = await originalInit();
      markWebGPUReady();
      return result;
    } catch (error) {
      markWebGPUInitError(error);
      throw error;
    }
  };

  return renderer;
};
