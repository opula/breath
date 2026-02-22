import { AudioContext } from "react-native-audio-api";

export const normalizeAudioBufferChannels = (
  buffer: AudioBuffer,
  targetChannels: number,
  audioContext: AudioContext,
): AudioBuffer => {
  if (buffer.numberOfChannels === targetChannels) {
    return buffer;
  }

  const normalizedBuffer = audioContext.createBuffer(
    targetChannels,
    buffer.length,
    buffer.sampleRate,
  );

  if (buffer.numberOfChannels === 1 && targetChannels === 2) {
    const originalData = buffer.getChannelData(0);
    const left = normalizedBuffer.getChannelData(0);
    const right = normalizedBuffer.getChannelData(1);
    for (let i = 0; i < buffer.length; i++) {
      left[i] = originalData[i];
      right[i] = originalData[i];
    }
  } else if (buffer.numberOfChannels === 2 && targetChannels === 1) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mono = normalizedBuffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      mono[i] = (left[i] + right[i]) / 2;
    }
  }

  return normalizedBuffer;
};
