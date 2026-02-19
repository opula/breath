// https://github.com/wcandillon/react-native-webgpu/blob/578ad989b4326724702b14245d5c82622849ee23/apps/example/src/ThreeJS/components/makeWebGPURenderer.ts#L1
import type { NativeCanvas } from "react-native-wgpu";
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

export const makeWebGPURenderer = (
  context: GPUCanvasContext,
  { antialias = true, alpha = false }: { antialias?: boolean; alpha?: boolean } = {},
) => {
  const renderer = new THREE.WebGPURenderer({
    antialias,
    alpha,
    // @ts-expect-error - RN canvas doesn't match HTMLCanvasElement type
    canvas: new ReactNativeCanvas(context.canvas),
    context,
  });

  const originalInit = renderer.init.bind(renderer) as (
    ...args: unknown[]
  ) => Promise<unknown>;

  renderer.init = async (...args: unknown[]) => {
    try {
      const result = await originalInit(...args);
      markWebGPUReady();
      return result;
    } catch (error) {
      markWebGPUInitError(error);
      throw error;
    }
  };

  return renderer;
};
