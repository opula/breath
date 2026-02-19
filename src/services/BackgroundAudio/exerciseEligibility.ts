import { Exercise } from "../../types/exercise";

/**
 * Returns true if every step in the exercise has a deterministic duration,
 * meaning the whole exercise can be pre-rendered to an audio buffer.
 *
 * - `breath` and `double-inhale` are always eligible (breath with count:0 → 1 cycle).
 * - `hold`, `inhale`, `exhale`, `text` must have count > 0.
 */
export const isExerciseEligibleForBackground = (exercise: Exercise): boolean =>
  exercise.seq.every((step) => {
    switch (step.type) {
      case "breath":
      case "double-inhale":
        return true;
      case "hold":
      case "inhale":
      case "exhale":
      case "text":
        return step.count > 0;
      default:
        return false;
    }
  });

/**
 * Calculate the total duration in seconds for an exercise repeated `loops` times.
 *
 * For each loop iteration, walks every step:
 * - `breath`: effectiveCount * sum(value).  count:0 → 1 cycle, no ramp applied.
 *   Ramp increases count by `ramp` each loop (starting from loop index 1).
 * - `double-inhale`: sum(value) — fixed durations per occurrence.
 * - `hold` / `inhale` / `exhale` / `text`: effectiveCount seconds.
 */
export const calculateExerciseDuration = (
  exercise: Exercise,
  loops: number,
): number => {
  let total = 0;

  for (let loop = 0; loop < loops; loop++) {
    for (const step of exercise.seq) {
      switch (step.type) {
        case "breath": {
          const values = step.value ?? [0, 0, 0, 0];
          const cycleSeconds = values.reduce((a, b) => a + b, 0);
          let effectiveCount: number;
          if (step.count === 0) {
            effectiveCount = 1;
          } else {
            const rampAdd = step.ramp ? step.ramp * loop : 0;
            effectiveCount = step.count + rampAdd;
          }
          total += effectiveCount * cycleSeconds;
          break;
        }
        case "double-inhale": {
          const values = step.value ?? [0, 0, 0];
          total += values.reduce((a, b) => a + b, 0);
          break;
        }
        case "hold":
        case "inhale":
        case "exhale":
        case "text": {
          total += step.count;
          break;
        }
      }
    }
  }

  return total;
};
