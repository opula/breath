import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Text, View } from "react-native";
import { MotiView } from "moti";
import Animated from "react-native-reanimated";
import tw from "../../utils/tw";
import { AnimatePresence } from "moti";
import { defer, delay, padStart, range, toNumber } from "lodash";
import EventEmitter from "eventemitter3";
import { incrementalCompletionTimer } from "../../utils/exercise";

import { exerciseScheduler } from "../../services/ExerciseScheduler";
import {
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { BreathRing } from "./BreathRing";
import {
  Directions,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { Vibration } from "react-native";
import { useDebouncedCallback } from "use-debounce";
import { LAST_EXERCISE, storage } from "../../utils/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppSelector } from "../../hooks/store";
import { exercisesSelector } from "../../state/exercises.selectors";
import { triggerHaptics } from "../../utils/haptics";
import { sourceIndexSelector } from "../../state/configuration.selectors";
import { Ops, exerciseEmitter } from "./emitter";

const breathLabels = ["inhale", "hold", "exhale", "hold"];

export const DynamicExercise = memo(
  ({
    onChangeSource,
    onPause,
  }: {
    onChangeSource?: (value: number) => void;
    onPause?: (value: boolean) => void;
  }) => {
    const exercises = useAppSelector(exercisesSelector);
    const { bottom } = useSafeAreaInsets();

    const [label, setLabel] = useState("");
    const [sublabel, setSublabel] = useState("");
    const [isBreathing, setBreathing] = useState(false);
    const [isText, setText] = useState(false);
    const [exerciseName, setExerciseName] = useState("");

    const emitter = useRef(exerciseEmitter);
    const seqIndex = useRef(-1);
    const loopCount = useRef(0);
    const breathPattern = useRef([0, 0, 0, 0]);
    const iBreath = useSharedValue(0);

    const exercisesRef = useRef(exercises);
    const exerciseIndex = useRef(storage.getNumber(LAST_EXERCISE) ?? 0);

    const debouncedSetExerciseName = useDebouncedCallback((value) => {
      setExerciseName(value);
    }, 2000);

    const runShowName = () => {
      const exercise = exercisesRef.current[exerciseIndex.current];
      setExerciseName(exercise.name);
      debouncedSetExerciseName("");
    };

    const runReset = (ignoreStart = false) => {
      exerciseScheduler.reset();

      iBreath.value = withTiming(0, { duration: 1 });
      seqIndex.current = -1;
      loopCount.current = 0;
      breathPattern.current = [0, 0, 0, 0];

      triggerHaptics();

      if (ignoreStart) {
        setLabel("");
        setSublabel("");
        setBreathing(false);
        setText(false);
        exerciseScheduler.stop();
        onPause?.(true);
      } else {
        defer(() => {
          exerciseScheduler.start();
          emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
          onPause?.(false);
        });
      }
    };

    const runToggle = () => {
      triggerHaptics();
      exerciseScheduler.toggle();
      const isActive = !exerciseScheduler.active();

      if (isActive) {
        const exercise = exercisesRef.current[exerciseIndex.current];
        setExerciseName(exercise.name);
        debouncedSetExerciseName("");
      }

      onPause?.(isActive);
    };

    const runNextExercise = (value: number) => {
      const nextIndex =
        (exercisesRef.current.length + exerciseIndex.current + value) %
        exercisesRef.current.length;
      exerciseIndex.current = nextIndex;

      if (seqIndex.current !== -1) {
        runReset(true);
      } else {
        iBreath.value = withTiming(0, { duration: 1 });
      }
      runShowName();
      storage.set(LAST_EXERCISE, nextIndex);
    };

    const runUserNext = () => {
      if (seqIndex.current === -1) {
        exerciseScheduler.start();
        emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
        runShowName();
        onPause?.(false);
        return;
      }

      if (!exerciseScheduler.active()) {
        return runToggle();
      }

      const currentSeqIndex = seqIndex.current;
      const exercise = exercisesRef.current[exerciseIndex.current];
      const { type, count } = exercise.seq[currentSeqIndex];

      if (count !== 0) return;

      exerciseScheduler.clearJobs();
      triggerHaptics();
      emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
      iBreath.value = withTiming(0, { duration: 1 });
    };

    useEffect(() => {
      emitter.current.on(Ops.START_BREATHING_PATTERN, (isLooped) => {
        const exercise = exercisesRef.current[exerciseIndex.current];
        const currentSeqIndex = seqIndex.current;
        const stepTime = breathPattern.current[0];
        const { count } = exercise.seq[currentSeqIndex];

        setSublabel(`n° ${count ? count : 1}`);
        setLabel(breathLabels[0]);

        exerciseScheduler.addJob(
          0,
          () => {
            iBreath.value = withTiming(1, { duration: stepTime * 1000 });

            if (isLooped) {
              Vibration.vibrate(400);
            }
          },
          {
            priority: 0,
          }
        );

        range(1, stepTime + 1).forEach((timeSeconds) => {
          exerciseScheduler.addJob(
            timeSeconds * 1000,
            () => {
              // setSublabel(timeSeconds);
            },
            {
              priority: 0,
              label: "Change count",
            }
          );
        });

        exerciseScheduler.addJob(
          stepTime * 1000,
          () => {
            Vibration.vibrate(400);
            emitter.current.emit(Ops.NEXT_BREATHING_PATTERN_STEP, 1);
          },
          {
            priority: 1,
            label: "Next seq",
          }
        );
      });

      emitter.current.on(Ops.NEXT_BREATHING_PATTERN_STEP, (step: number) => {
        const exercise = exercisesRef.current[exerciseIndex.current];
        const stepIndex = step % 4;
        const stepTime = breathPattern.current[stepIndex];
        const currentSeqIndex = seqIndex.current;
        const nextIndex = (seqIndex.current + 1) % exercise.seq.length;
        const totalPatterns = exercise.seq[currentSeqIndex].count;
        const completedPatterns = Math.floor(step / 4);
        const nextVibratePattern =
          exercise.seq[nextIndex].type === "breath" ? 400 : [300, 300];
        const { count } = exercise.seq[currentSeqIndex];

        if (stepTime === 0) {
          if (
            stepIndex === 3 &&
            totalPatterns !== 0 &&
            completedPatterns + 1 >= totalPatterns
          ) {
            Vibration.vibrate(nextVibratePattern);
            return emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
          }

          return emitter.current.emit(
            Ops.NEXT_BREATHING_PATTERN_STEP,
            step + 1
          );
        }

        if (stepIndex === 0) {
          iBreath.value = withTiming(1, { duration: stepTime * 1000 });
        } else if (stepIndex === 2) {
          iBreath.value = withTiming(0, { duration: stepTime * 1000 });
        }

        setLabel(breathLabels[stepIndex]);
        setSublabel(
          `n° ${count ? count - completedPatterns : completedPatterns + 1}`
        );

        range(1, stepTime + 1).forEach((timeSeconds) => {
          exerciseScheduler.addJob(
            timeSeconds * 1000,
            () => {
              // setSublabel(timeSeconds);
            },
            {
              priority: 0,
              label: "Change count",
            }
          );
        });

        exerciseScheduler.addJob(
          stepTime * 1000,
          () => {
            if (
              stepIndex === 3 &&
              totalPatterns !== 0 &&
              completedPatterns + 1 >= totalPatterns
            ) {
              Vibration.vibrate(nextVibratePattern);
              return emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
            }

            Vibration.vibrate(400);
            return emitter.current.emit(
              Ops.NEXT_BREATHING_PATTERN_STEP,
              step + 1
            );
          },
          {
            priority: 1,
            label: "Next seq",
          }
        );
      });

      emitter.current.on(Ops.START_HIE, () => {
        const exercise = exercisesRef.current[exerciseIndex.current];
        const currentSeqIndex = seqIndex.current;
        const { type, count } = exercise.seq[currentSeqIndex];

        setLabel(type);
        setSublabel(
          count ? padStart(`${count}`, 2, "0") : padStart(`${0}`, 2, "0")
        );

        if (count) {
          range(1, count + 1).forEach((timeSeconds) => {
            exerciseScheduler.addJob(
              timeSeconds * 1000,
              () => {
                setSublabel(padStart(`${count - timeSeconds}`, 2, "0"));
              },
              {
                priority: 0,
                label: "Countdown",
              }
            );
          });

          exerciseScheduler.addJob(
            count * 1000,
            () => {
              triggerHaptics();
              emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
            },
            {
              priority: 1,
              label: "Next Seq",
            }
          );
        } else {
          exerciseScheduler.addJob(
            1000,
            () => {
              setSublabel((count) =>
                padStart(`${toNumber(count) + 1}`, 2, "0")
              );
            },
            {
              priority: 0,
              label: "Count up, inf",
              repeat: 1000,
            }
          );
        }
      });

      emitter.current.on(Ops.START_TEXT, () => {
        const exercise = exercisesRef.current[exerciseIndex.current];
        const currentSeqIndex = seqIndex.current;

        // @ts-ignore
        const { text, count } = exercise.seq[currentSeqIndex];

        setLabel(text!);

        if (count) {
          range(1, count + 1).forEach((timeSeconds) => {
            exerciseScheduler.addJob(
              timeSeconds * 1000,
              () => {
                setSublabel(padStart(`${count - timeSeconds}`, 2, "0"));
              },
              {
                priority: 0,
                label: "Countdown",
              }
            );
          });

          exerciseScheduler.addJob(
            count * 1000,
            () => {
              triggerHaptics();
              emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
            },
            {
              priority: 1,
              label: "Next Seq",
            }
          );
        } else {
          exerciseScheduler.addJob(
            1000,
            () => {
              setSublabel((count) =>
                padStart(`${toNumber(count) + 1}`, 2, "0")
              );
            },
            {
              priority: 0,
              label: "Count up, inf",
              repeat: 1000,
            }
          );
        }
      });

      emitter.current.on(Ops.NEXT_SEQUENCE_STEP, () => {
        const exercise = exercisesRef.current[exerciseIndex.current];
        const currentIndex = seqIndex.current;
        const nextIndex = (seqIndex.current + 1) % exercise.seq.length;

        if (!exercise.loopable && nextIndex < currentIndex) {
          return runReset();
        }

        // @ts-ignore
        const { type, value, count } = exercise.seq[nextIndex];

        seqIndex.current = nextIndex;

        switch (type) {
          case "breath":
            breathPattern.current = value as number[];
            loopCount.current = 0;
            emitter.current.emit(
              Ops.START_BREATHING_PATTERN,
              currentIndex > -1
            );
            setBreathing(true);
            setText(false);
            break;

          case "text":
            emitter.current.emit(Ops.START_TEXT);
            setText(true);
            setBreathing(false);
            break;

          case "hold":
          case "inhale":
          case "exhale":
            emitter.current.emit(Ops.START_HIE);
            setBreathing(false);
            setText(false);
            break;
        }
      });

      emitter.current.on(Ops.GOTO_SEQUENCE, (index: number) => {
        exerciseIndex.current = index;
        runReset();
      });

      runShowName();

      return () => {
        exerciseScheduler.reset();
        emitter.current.removeAllListeners();
      };
    }, []);

    useEffect(() => {
      exercisesRef.current = exercises;
    }, [exercises]);

    const singleTap = useMemo(
      () =>
        Gesture.Tap().onEnd((_, success) => {
          if (!success) return;

          runOnJS(runUserNext)();
        }),
      []
    );

    const doubleTap = useMemo(
      () =>
        Gesture.Tap()
          .numberOfTaps(2)
          .onEnd((_, success) => {
            if (!success) return;

            runOnJS(runToggle)();
          }),
      []
    );

    const longPress = useMemo(
      () =>
        Gesture.LongPress().onEnd((_, success) => {
          if (!success) return;

          runOnJS(runReset)();
        }),
      []
    );

    const swipeLeft = useMemo(
      () =>
        Gesture.Fling()
          .direction(Directions.LEFT)
          .onEnd((_, success) => {
            if (!success) return;
            if (!onChangeSource) return;

            runOnJS(onChangeSource)(-1);
          }),
      [exerciseIndex]
    );
    const swipeRight = useMemo(
      () =>
        Gesture.Fling()
          .direction(Directions.RIGHT)
          .onEnd((_, success) => {
            if (!success) return;
            if (!onChangeSource) return;

            runOnJS(onChangeSource)(1);
          }),
      [exerciseIndex]
    );

    const swipeUp = useMemo(
      () =>
        Gesture.Fling()
          .direction(Directions.UP)
          .onEnd((_, success) => {
            if (!success) return;

            runOnJS(runNextExercise)(1);
          }),
      [onChangeSource]
    );

    const swipeDown = useMemo(
      () =>
        Gesture.Fling()
          .direction(Directions.DOWN)
          .onEnd((_, success) => {
            if (!success) return;

            runOnJS(runNextExercise)(-1);
          }),
      [onChangeSource]
    );

    return (
      <GestureDetector
        gesture={Gesture.Exclusive(
          swipeRight,
          swipeLeft,
          swipeUp,
          swipeDown,
          doubleTap,
          longPress,
          singleTap
        )}
      >
        <Animated.View style={tw`absolute inset-0 bg-transparent`}>
          <View style={tw`absolute inset-0 justify-center items-center z-0`}>
            {isBreathing ? (
              <BreathRing breath={iBreath} />
            ) : null}
          </View>
          <View style={tw`absolute inset-0 items-center justify-center`}>
            <AnimatePresence exitBeforeEnter>
              <View
                style={[
                  tw`items-center justify-center`,
                  {
                    height: isText ? 144 : 96,
                    width: isText ? 144 : 96,
                  },
                ]}
              >
                <Text
                  style={[
                    tw`${
                      isText ? "text-sm" : "text-base"
                    } font-lusitana text-neutral-200 text-center mb-2`,
                    { fontVariant: ["tabular-nums"] },
                  ]}
                >
                  {label}
                </Text>
                {!isText ? (
                  <View style={tw`absolute left-0 right-0 bottom-[22px]`}>
                    <Text
                      style={[
                        tw`text-xs font-lusitana text-neutral-400 text-center`,
                        { fontVariant: ["tabular-nums"] },
                      ]}
                    >
                      {sublabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </AnimatePresence>
          </View>

          <AnimatePresence>
            {exerciseName && (
              <MotiView
                key={exerciseName}
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ opacity: { type: "timing", duration: 500 } }}
                style={[
                  tw`absolute left-0 right-0 justify-center items-center`,
                  {
                    bottom: bottom + 16,
                  },
                ]}
              >
                <View style={tw`px-6 py-2 rounded-xl bg-black`}>
                  <Text style={tw`text-neutral-200 text-xs font-lusitana`}>
                    {exerciseName}
                  </Text>
                </View>
              </MotiView>
            )}
          </AnimatePresence>
        </Animated.View>
      </GestureDetector>
    );
  }
);
