type WebGPUReadyListener = () => void;
type WebGPUErrorListener = (error: unknown) => void;

let isReady = false;

const readyListeners = new Set<WebGPUReadyListener>();
const errorListeners = new Set<WebGPUErrorListener>();

export const hasWebGPUInitialized = () => isReady;

export const onWebGPUReady = (listener: WebGPUReadyListener) => {
  if (isReady) {
    listener();
    return () => {};
  }

  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
};

export const onWebGPUInitError = (listener: WebGPUErrorListener) => {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
};

export const markWebGPUReady = () => {
  if (isReady) {
    return;
  }

  isReady = true;
  readyListeners.forEach((listener) => listener());
};

export const markWebGPUInitError = (error: unknown) => {
  errorListeners.forEach((listener) => listener(error));
};
