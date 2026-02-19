import { AudioContext } from "react-native-audio-api";
import { Exercise } from "../../types/exercise";
import {
  createSilenceAudioBuffer,
  concatenateAudioBuffers,
  normalizeAudioBufferChannels,
} from "./audioBufferUtils";

type SoundCues = {
  inhale: AudioBuffer | null;
  exhale: AudioBuffer | null;
  hold: AudioBuffer | null;
};

/**
 * Create a mono buffer of `phaseDurationSec` with the sound cue placed at offset 0.
 * The rest is silence (zeros).
 */
const createPhaseBuffer = (
  soundCue: AudioBuffer | null,
  phaseDurationSec: number,
  audioContext: AudioContext,
): AudioBuffer => {
  const sampleRate = audioContext.sampleRate || 44100;
  const totalSamples = Math.max(1, Math.round(sampleRate * phaseDurationSec));
  const buffer = audioContext.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  if (soundCue) {
    const mono = normalizeAudioBufferChannels(soundCue, 1, audioContext);
    const cueData = mono.getChannelData(0);
    const copyLen = Math.min(cueData.length, totalSamples);
    for (let i = 0; i < copyLen; i++) {
      data[i] = cueData[i];
    }
  }

  return buffer;
};

/**
 * Pre-render an entire exercise (repeated `loops` times) into a single mono AudioBuffer.
 *
 * Walk each step for each loop iteration and produce phase buffers that are
 * concatenated into the final result.
 */
export const renderExerciseAudio = (
  exercise: Exercise,
  loops: number,
  soundCues: SoundCues,
  audioContext: AudioContext,
  delaySec: number = 0,
): AudioBuffer => {
  const segments: AudioBuffer[] = [];

  if (delaySec > 0) {
    segments.push(createSilenceAudioBuffer(audioContext, delaySec, 1));
  }

  for (let loop = 0; loop < loops; loop++) {
    for (const step of exercise.seq) {
      switch (step.type) {
        case "breath": {
          const [inhaleDur = 0, hold1Dur = 0, exhaleDur = 0, hold2Dur = 0] =
            step.value ?? [];
          let effectiveCount: number;
          if (step.count === 0) {
            effectiveCount = 1;
          } else {
            const rampAdd = step.ramp ? step.ramp * loop : 0;
            effectiveCount = step.count + rampAdd;
          }

          for (let cycle = 0; cycle < effectiveCount; cycle++) {
            if (inhaleDur > 0) {
              segments.push(
                createPhaseBuffer(soundCues.inhale, inhaleDur, audioContext),
              );
            }
            if (hold1Dur > 0) {
              segments.push(
                createPhaseBuffer(soundCues.hold, hold1Dur, audioContext),
              );
            }
            if (exhaleDur > 0) {
              segments.push(
                createPhaseBuffer(soundCues.exhale, exhaleDur, audioContext),
              );
            }
            if (hold2Dur > 0) {
              segments.push(
                createPhaseBuffer(soundCues.hold, hold2Dur, audioContext),
              );
            }
          }
          break;
        }

        case "inhale": {
          segments.push(
            createPhaseBuffer(soundCues.inhale, step.count, audioContext),
          );
          break;
        }

        case "exhale": {
          segments.push(
            createPhaseBuffer(soundCues.exhale, step.count, audioContext),
          );
          break;
        }

        case "hold": {
          segments.push(
            createPhaseBuffer(soundCues.hold, step.count, audioContext),
          );
          break;
        }

        case "text": {
          segments.push(
            createSilenceAudioBuffer(audioContext, step.count, 1),
          );
          break;
        }

        case "double-inhale": {
          const [firstDur = 0, pauseDur = 0, secondDur = 0] =
            step.value ?? [];
          if (firstDur > 0) {
            segments.push(
              createPhaseBuffer(soundCues.inhale, firstDur, audioContext),
            );
          }
          if (pauseDur > 0) {
            segments.push(
              createSilenceAudioBuffer(audioContext, pauseDur, 1),
            );
          }
          if (secondDur > 0) {
            segments.push(
              createPhaseBuffer(soundCues.inhale, secondDur, audioContext),
            );
          }
          break;
        }
      }
    }
  }

  if (segments.length === 0) {
    return createSilenceAudioBuffer(audioContext, 0.1, 1);
  }

  return concatenateAudioBuffers(segments, audioContext);
};
