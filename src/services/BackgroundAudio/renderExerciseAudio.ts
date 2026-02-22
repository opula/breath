import { Exercise } from "../../types/exercise";

export type CueType = "inhale" | "exhale" | "hold";

export type ScheduledEvent = {
  time: number; // seconds from start of playback
  cue: CueType;
  duration: number; // phase duration (to auto-stop cue at phase boundary)
};

export type PlaybackSchedule = {
  events: ScheduledEvent[];
  totalDuration: number;
};

/**
 * Build a schedule of sound-cue events for an exercise.
 *
 * Pure data function — no AudioBuffers or AudioContext needed.
 * Walk every step for `loops` iterations and emit { time, cue, duration }
 * for each phase that has a sound cue. Silent phases just advance the cursor.
 */
export const buildPlaybackSchedule = (
  exercise: Exercise,
  loops: number,
  delaySec: number = 0,
): PlaybackSchedule => {
  const events: ScheduledEvent[] = [];
  let cursor = delaySec;

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
              events.push({ time: cursor, cue: "inhale", duration: inhaleDur });
              cursor += inhaleDur;
            }
            if (hold1Dur > 0) {
              events.push({ time: cursor, cue: "hold", duration: hold1Dur });
              cursor += hold1Dur;
            }
            if (exhaleDur > 0) {
              events.push({ time: cursor, cue: "exhale", duration: exhaleDur });
              cursor += exhaleDur;
            }
            if (hold2Dur > 0) {
              events.push({ time: cursor, cue: "hold", duration: hold2Dur });
              cursor += hold2Dur;
            }
          }
          break;
        }

        case "inhale": {
          events.push({ time: cursor, cue: "inhale", duration: step.count });
          cursor += step.count;
          break;
        }

        case "exhale": {
          events.push({ time: cursor, cue: "exhale", duration: step.count });
          cursor += step.count;
          break;
        }

        case "hold": {
          events.push({ time: cursor, cue: "hold", duration: step.count });
          cursor += step.count;
          break;
        }

        case "text": {
          // Silent phase — just advance cursor
          cursor += step.count;
          break;
        }

        case "double-inhale": {
          const [firstDur = 0, pauseDur = 0, secondDur = 0] =
            step.value ?? [];
          if (firstDur > 0) {
            events.push({ time: cursor, cue: "inhale", duration: firstDur });
            cursor += firstDur;
          }
          if (pauseDur > 0) {
            // Silent pause between double-inhale parts
            cursor += pauseDur;
          }
          if (secondDur > 0) {
            events.push({ time: cursor, cue: "inhale", duration: secondDur });
            cursor += secondDur;
          }
          break;
        }
      }
    }
  }

  return { events, totalDuration: cursor };
};
