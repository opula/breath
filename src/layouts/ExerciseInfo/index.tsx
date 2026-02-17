import {
  NavigationProp,
  RouteProp,
  useFocusEffect,
} from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MainStackParams } from "../../navigation";
import { useParametrizedAppSelector } from "../../utils/selectors";
import { exerciseByIdSelector } from "../../state/exercises.selectors";
import { View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";
import { Icon } from "../../components/Icon";
import {
  Canvas,
  Fill,
  Shader,
  useClock,
  vec,
} from "@shopify/react-native-skia";
import { source } from "../../components/DynamicExercise/source";
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ops, exerciseEmitter } from "../../components/DynamicExercise/emitter";
import { exerciseScheduler } from "../../services/ExerciseScheduler";
import { Vibration } from "react-native";
import { capitalize, defer, padStart, range, toNumber } from "lodash";
import { triggerHaptics } from "../../utils/haptics";
import EventEmitter from "eventemitter3";
import { count } from "rxjs";
import { SafeAreaView } from "react-native-safe-area-context";

const breathLabels = ["inhale", "hold", "exhale", "hold"];

interface Props {
  navigation: NavigationProp<MainStackParams, "ExerciseInfo">;
  route: RouteProp<MainStackParams, "ExerciseInfo">;
}

export const ExerciseInfo = ({ navigation, route }: Props) => {
  const exercise = useParametrizedAppSelector(
    exerciseByIdSelector,
    route.params.id,
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [label, setLabel] = useState("");
  const [sublabel, setSublabel] = useState("");
  const [isBreathing, setBreathing] = useState(false);
  const [isText, setText] = useState(false);

  const emitter = useRef(new EventEmitter());
  const seqIndex = useRef(-1);
  const breathPattern = useRef([0, 0, 0, 0]);
  const clock = useClock();
  const iBreath = useSharedValue(0);

  const currentType = exercise.seq[currentIndex].type;
  const currentValue = exercise.seq[currentIndex].value;
  const currentCount = exercise.seq[currentIndex].count;

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(240, 240),
      iTime: clock.value / 1000,
      iBreath: iBreath.value,
    };
  }, [clock, iBreath]);

  const runUserPrev = () => {
    exerciseScheduler.clearJobs();
    triggerHaptics();
    emitter.current.emit(Ops.PREV_SEQUENCE_STEP);
    iBreath.value = withTiming(0, { duration: 1 });
  };

  const runUserNext = () => {
    if (seqIndex.current === -1) {
      exerciseScheduler.start();
      emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
      return;
    }

    exerciseScheduler.clearJobs();
    triggerHaptics();
    emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
    iBreath.value = withTiming(0, { duration: 1 });
  };

  const runReset = useCallback(() => {
    exerciseScheduler.reset();

    iBreath.value = withTiming(0, { duration: 1 });
    seqIndex.current = -1;
    breathPattern.current = [0, 0, 0, 0];

    triggerHaptics();

    defer(() => {
      exerciseScheduler.start();
      emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      emitter.current.on(Ops.START_BREATHING_PATTERN, (isLooped) => {
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
          },
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
            },
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
          },
        );
      });

      emitter.current.on(Ops.NEXT_BREATHING_PATTERN_STEP, (step: number) => {
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
            (totalPatterns === 0
              ? breathPattern.current.every((v) => v === 0)
              : completedPatterns + 1 >= totalPatterns)
          ) {
            Vibration.vibrate(nextVibratePattern);
            return emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
          }

          return emitter.current.emit(
            Ops.NEXT_BREATHING_PATTERN_STEP,
            step + 1,
          );
        }

        if (stepIndex === 0) {
          iBreath.value = withTiming(1, { duration: stepTime * 1000 });
        } else if (stepIndex === 2) {
          iBreath.value = withTiming(0, { duration: stepTime * 1000 });
        }

        setLabel(breathLabels[stepIndex]);
        setSublabel(
          `n° ${count ? count - completedPatterns : completedPatterns + 1}`,
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
            },
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
              step + 1,
            );
          },
          {
            priority: 1,
            label: "Next seq",
          },
        );
      });

      emitter.current.on(Ops.START_HIE, () => {
        const currentSeqIndex = seqIndex.current;
        const { type, count } = exercise.seq[currentSeqIndex];

        setLabel(type);
        setSublabel(
          count ? padStart(`${count}`, 2, "0") : padStart(`${0}`, 2, "0"),
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
              },
            );
          });

          exerciseScheduler.addJob(
            count * 1000,
            () => {
              triggerHaptics();
              // emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
            },
            {
              priority: 1,
              label: "Next Seq",
            },
          );
        } else {
          exerciseScheduler.addJob(
            1000,
            () => {
              setSublabel((count) =>
                padStart(`${toNumber(count) + 1}`, 2, "0"),
              );
            },
            {
              priority: 0,
              label: "Count up, inf",
              repeat: 1000,
            },
          );
        }
      });

      emitter.current.on(Ops.START_TEXT, () => {
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
              },
            );
          });

          exerciseScheduler.addJob(
            count * 1000,
            () => {
              triggerHaptics();
              // emitter.current.emit(Ops.NEXT_SEQUENCE_STEP);
            },
            {
              priority: 1,
              label: "Next Seq",
            },
          );
        } else {
          exerciseScheduler.addJob(
            1000,
            () => {
              setSublabel((count) =>
                padStart(`${toNumber(count) + 1}`, 2, "0"),
              );
            },
            {
              priority: 0,
              label: "Count up, inf",
              repeat: 1000,
            },
          );
        }
      });

      emitter.current.on(Ops.PREV_SEQUENCE_STEP, () => {
        const currentIndex = seqIndex.current;
        const nextIndex = Math.max(seqIndex.current - 1, 0);

        if (!exercise.loopable && nextIndex < currentIndex) {
          return runReset();
        }

        // @ts-ignore
        const { type, value, count } = exercise.seq[nextIndex];

        seqIndex.current = nextIndex;

        switch (type) {
          case "breath":
            breathPattern.current = value as number[];
            emitter.current.emit(
              Ops.START_BREATHING_PATTERN,
              currentIndex > -1,
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

      emitter.current.on(Ops.NEXT_SEQUENCE_STEP, () => {
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
            emitter.current.emit(
              Ops.START_BREATHING_PATTERN,
              currentIndex > -1,
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

      return () => {
        exerciseScheduler.reset();
        emitter.current.removeAllListeners();
      };
    }, []),
  );

  useEffect(() => {
    defer(() => {
      runUserNext();
    });
  }, []);

  return (
    <View style={tw`flex-1 bg-black`}>
      <SafeAreaView style={tw`flex-1 px-4`}>
        <View style={tw`flex-row px-4 justify-between items-center`}>
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={20} color="white" />
          </Pressable>
          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 text-white`}
          >
            {exercise.name}
          </Text>

          <View style={tw`h-10 w-10 items-center justify-center`}></View>
        </View>

        <View style={tw`flex-1`}>
          <View style={tw`flex-row h-10 items-center px-6`}>
            {exercise.seq.map((_, index) => (
              <View
                key={`${index}-step`}
                style={tw`${index !== 0 ? "ml-1" : ""} ${index !== exercise.seq.length - 1 ? "mr-1" : ""} flex-1 h-1 rounded-sm ${currentIndex >= index ? "bg-neutral-200" : "bg-neutral-700"}`}
              />
            ))}
          </View>

          <View style={tw`flex-1 justify-center items-center`}>
            {isBreathing ? (
              <Canvas style={{ height: 240, width: 240 }}>
                <Fill>
                  <Shader source={source} uniforms={uniforms} />
                </Fill>
              </Canvas>
            ) : (
              <View
                style={tw`${isText ? "h-36 w-36" : "h-24 w-24"} items-center justify-center`}
              >
                <Text
                  style={[
                    tw`${isText ? "text-base" : "text-xl"} font-inter text-center text-neutral-200 mb-2`,
                    {
                      fontVariant: isText ? [] : ["tabular-nums"],
                      fontStyle: isText ? "italic" : undefined,
                    },
                  ]}
                >
                  {label}
                </Text>
                {!isText ? (
                  <View style={tw`absolute inset-x-0 bottom-[22px]`}>
                    <Text
                      style={[
                        tw`text-xs font-inter text-center text-neutral-400`,
                        {
                          fontVariant: ["tabular-nums"],
                        },
                      ]}
                    >
                      {sublabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View style={tw`justify-end items-center mb-2 h-16`}>
            {currentType === "breath" ? (
              <>
                <Text
                  style={tw`text-xs font-inter text-white text-center`}
                >{`Maintain a breathing cycle of: ${
                  currentValue![0]
                }s · ${currentValue![1]}s · ${currentValue![2]}s · ${
                  currentValue![3]
                }s`}</Text>
                <Text
                  style={tw`text-[10px] font-inter text-neutral-400 text-center mt-2`}
                >
                  {currentCount
                    ? `Repeat ${currentCount} times`
                    : `Will repeat until you tap to continue`}
                </Text>
              </>
            ) : currentType === "hold" ? (
              <>
                <Text style={tw`text-xs font-inter text-white text-center`}>
                  {currentCount
                    ? `Hold for ${currentCount} seconds`
                    : "Hold as long as you can"}
                </Text>
                {!currentCount ? (
                  <Text
                    style={tw`text-[10px] font-inter text-neutral-400 text-center mt-2`}
                  >
                    {`Tap to continue`}
                  </Text>
                ) : null}
              </>
            ) : currentType === "inhale" || currentType === "exhale" ? (
              <Text style={tw`text-xs font-inter text-white text-center`}>
                {`${capitalize(currentType)} for ${currentCount} seconds`}
              </Text>
            ) : currentType === "text" ? (
              <>
                <Text style={tw`text-xs font-inter text-white text-center`}>
                  {currentCount
                    ? `Will show text for ${currentCount} seconds`
                    : "Will show text for as long as you like"}
                </Text>
                {!currentCount ? (
                  <Text
                    style={tw`text-[10px] font-inter text-neutral-400 text-center mt-2`}
                  >
                    {`Tap to continue`}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>

          <View style={tw`absolute inset-0 flex-row`}>
            <Pressable
              style={tw`w-32 h-full justify-center pl-4 pb-8`}
              onPress={() => {
                if (currentIndex) {
                  setCurrentIndex(currentIndex - 1);
                  runUserPrev();
                }
              }}
            >
              {currentIndex ? (
                <Icon
                  name="chevron-left"
                  color="rgba(255,255,255,.2)"
                  size={24}
                />
              ) : null}
            </Pressable>
            <Pressable
              style={tw`flex-1 h-full justify-center items-end pr-4 pb-8`}
              onPress={() => {
                if (currentIndex < exercise.seq.length - 1) {
                  setCurrentIndex(currentIndex + 1);
                  runUserNext();
                } else {
                  navigation.goBack();
                }
              }}
            >
              <Icon
                name="chevron-right"
                color="rgba(255,255,255,.2)"
                size={24}
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};
