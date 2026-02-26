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
      case "repeat":
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

/** Matches ExerciseEngine.getEffectiveCount — multiplicative linear ramp. */
const getEffectiveCount = (
  count: number,
  ramp: number | undefined,
  loop: number,
): number => {
  if (!count || !ramp || ramp <= 1) return count;
  return Math.round(count * (1 + loop * (ramp - 1)));
};

/**
 * Calculate the total duration in seconds for an exercise repeated `loops` times.
 *
 * For each loop iteration, walks every step:
 * - `breath`: effectiveCount * sum(value).  count:0 → 1 cycle, no ramp applied.
 *   Ramp multiplies count by `ramp` each loop (starting from loop index 1).
 * - `double-inhale`: sum(value) — fixed durations per occurrence.
 * - `hold` / `inhale` / `exhale` / `text`: effectiveCount seconds.
 */
const stepDuration = (
  step: Exercise["seq"][number],
  loop: number,
): number => {
  switch (step.type) {
    case "breath": {
      const values = step.value ?? [0, 0, 0, 0];
      const cycleSeconds = values.reduce((a, b) => a + b, 0);
      const effectiveCount = step.count === 0
        ? 1
        : getEffectiveCount(step.count, step.ramp, loop);
      return effectiveCount * cycleSeconds;
    }
    case "double-inhale": {
      const values = step.value ?? [0, 0, 0];
      return values.reduce((a, b) => a + b, 0);
    }
    case "hold":
    case "inhale":
    case "exhale":
    case "text":
      return getEffectiveCount(step.count, step.ramp, loop);
    case "repeat":
      return 0; // handled separately
    default:
      return 0;
  }
};

export const calculateExerciseDuration = (
  exercise: Exercise,
  loops: number,
): number => {
  let total = 0;

  for (let loop = 0; loop < loops; loop++) {
    for (let i = 0; i < exercise.seq.length; i++) {
      const step = exercise.seq[i];
      if (step.type === "repeat") {
        const lookback = (step.value as number[])?.[0] ?? 1;
        const repeatCount = getEffectiveCount(step.count, step.ramp, loop);
        if (repeatCount <= 0) continue;
        const blockStart = Math.max(0, i - lookback);
        let blockDuration = 0;
        for (let j = blockStart; j < i; j++) {
          if (exercise.seq[j].type === "repeat") continue;
          blockDuration += stepDuration(exercise.seq[j], loop);
        }
        // The block steps are already counted once in the main loop,
        // so add (repeatCount - 1) extra iterations
        total += (repeatCount - 1) * blockDuration;
      } else {
        total += stepDuration(step, loop);
      }
    }
  }

  return total;
};
