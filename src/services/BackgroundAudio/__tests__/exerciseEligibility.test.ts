import type { Exercise } from "../../../types/exercise";
import {
  calculateExerciseDuration,
  calculateMaxLoopsForDuration,
} from "../exerciseEligibility";

const tenSecondExercise: Exercise = {
  id: "ten-second",
  name: "Ten Second",
  loopable: true,
  seq: [{ id: "hold", type: "hold", count: 10 }],
};

const rampingExercise: Exercise = {
  id: "ramping",
  name: "Ramping",
  loopable: true,
  seq: [
    {
      id: "breath",
      type: "breath",
      value: [2, 0, 2, 0],
      count: 10,
      ramp: 2,
    },
  ],
};

const longExercise: Exercise = {
  id: "long",
  name: "Long",
  loopable: true,
  seq: [{ id: "hold", type: "hold", count: 4000 }],
};

describe("background audio exercise eligibility", () => {
  it("caps fixed-duration exercises by total requested duration", () => {
    expect(calculateMaxLoopsForDuration(tenSecondExercise, 60)).toBe(6);
  });

  it("uses ramp-aware total duration when capping loops", () => {
    expect(calculateExerciseDuration(rampingExercise, 1)).toBe(40);
    expect(calculateExerciseDuration(rampingExercise, 2)).toBe(120);
    expect(calculateMaxLoopsForDuration(rampingExercise, 100)).toBe(1);
    expect(calculateMaxLoopsForDuration(rampingExercise, 120)).toBe(2);
  });

  it("keeps at least one loop available for exercises longer than the cap", () => {
    expect(calculateMaxLoopsForDuration(longExercise, 3600)).toBe(1);
  });
});
