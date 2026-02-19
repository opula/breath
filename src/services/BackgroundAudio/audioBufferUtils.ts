import { AudioContext } from "react-native-audio-api";

export const createSilenceAudioBuffer = (
  audioContext: AudioContext,
  durationInSeconds = 1,
  numberOfChannels = 1,
) => {
  const sampleRate = audioContext.sampleRate || 44100;
  const numberOfSamples = sampleRate * durationInSeconds;
  return audioContext.createBuffer(numberOfChannels, numberOfSamples, sampleRate);
};

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

export const concatenateAudioBuffers = (
  audioBuffers: AudioBuffer[],
  audioContext: AudioContext,
): AudioBuffer => {
  if (audioBuffers.length === 0) {
    throw new Error("Cannot concatenate empty array of buffers");
  }

  const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0);
  const { numberOfChannels, sampleRate } = audioBuffers[0];

  const result = audioContext.createBuffer(
    numberOfChannels,
    totalLength,
    sampleRate,
  );

  let offset = 0;
  for (const buffer of audioBuffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const resultData = result.getChannelData(channel);
      const bufferData = buffer.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        resultData[offset + i] = bufferData[i];
      }
    }
    offset += buffer.length;
  }

  return result;
};

export const applyGainWithSoftLimiting = (
  audioBuffer: AudioBuffer,
  gainValue: number,
  audioContext: AudioContext,
): AudioBuffer => {
  const gainedBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel);
    const gainedData = gainedBuffer.getChannelData(channel);

    for (let i = 0; i < audioBuffer.length; i++) {
      let sample = originalData[i] * gainValue;
      if (Math.abs(sample) > 0.95) {
        sample = Math.sign(sample) * Math.tanh(Math.abs(sample));
      }
      gainedData[i] = sample;
    }
  }

  return gainedBuffer;
};
