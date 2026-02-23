import React, { useEffect, useMemo, useRef, useState } from "react";
import { TrayScreen } from "../../components/TrayScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, TextInput, Keyboard, Pressable, ScrollView } from "react-native";
import tw from "../../utils/tw";
import { RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { exerciseByIdSelector } from "../../state/exercises.selectors";
import { Exercise } from "../../types/exercise";
import { capitalize } from "lodash";
import {
  updateExerciseStepCount,
  updateExerciseStepRamp,
  updateExerciseStepText,
  updateExerciseStepValue,
} from "../../state/exercises.reducer";
import Decimal from "decimal.js";
import { HorizontalDial } from "../../components/HorizontalDial";
import { convertSecondsToHHMM } from "../../utils/pretty";

interface Props {
  route: RouteProp<MainStackParams, "AdjustStep">;
}

const breathLabels = ["Inhale", "Hold", "Exhale", "Hold"];

export const AdjustStep = ({ route }: Props) => {
  const { exerciseId, stepId } = route.params;
  const { bottom } = useSafeAreaInsets();
  const exercise = useAppSelector((state) =>
    exerciseByIdSelector(state, exerciseId),
  );
  const dispatch = useAppDispatch();

  const step = useMemo(
    () => exercise.seq.find((step) => step.id === stepId),
    [exercise, stepId],
  );
  const { type, value, count } = step || {};

  const isBreath = type === "breath";
  const isDoubleInhale = type === "double-inhale";
  const isText = type === "text";
  const isRepeat = type === "repeat";
  const isSingle = type === "exhale" || type === "hold" || type === "inhale";

  const totalDuration = useMemo(() => {
    if (!isBreath || !Array.isArray(value) || !count) return null;
    const sum = value.reduce((acc: number, v: number) => acc + v, 0);
    return count * sum;
  }, [isBreath, value, count]);

  if (isBreath) {
    return (
      <TrayScreen trayHeight={570 + bottom}>
        <View style={tw`pt-4 px-2 pb-4`}>
          <Text style={tw`text-base font-inter text-white text-center`}>
            {capitalize(type)}
          </Text>

          <View style={tw`gap-y-6 my-4`}>
            {breathLabels.map((label, index) => (
              <View key={`breath-${index}`}>
                <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                  {label}
                </Text>
                <HorizontalDial
                  min={0}
                  max={30}
                  step={0.1}
                  suffix="s"
                  defaultValue={(value as number[])?.[index] ?? 0}
                  onChange={(newValue: number) => {
                    dispatch(
                      updateExerciseStepValue({
                        exerciseId,
                        stepId,
                        value: (value as number[]).map((v, i) =>
                          i === index
                            ? new Decimal(newValue)
                                .toDecimalPlaces(1)
                                .toNumber()
                            : v,
                        ),
                      }),
                    );
                  }}
                />
              </View>
            ))}

            <View>
              <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                Count
              </Text>
              <HorizontalDial
                min={0}
                max={1000}
                step={1}
                suffix="x"
                zeroLabel="∞"
                defaultValue={count ?? 0}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepCount({
                      exerciseId,
                      stepId,
                      count: Math.round(newValue),
                    }),
                  );
                }}
              />
            </View>

            <View
              style={!count ? tw`opacity-50` : undefined}
              pointerEvents={!count ? "none" : "auto"}
            >
              <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                Ramp
              </Text>
              <HorizontalDial
                min={1}
                max={3}
                step={0.1}
                suffix="x"
                defaultValue={step?.ramp ?? 1}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepRamp({
                      exerciseId,
                      stepId,
                      ramp: new Decimal(newValue)
                        .toDecimalPlaces(1)
                        .toNumber(),
                    }),
                  );
                }}
              />
            </View>
          </View>
          <View style={tw`mt-3 items-center`}>
            {totalDuration !== null && totalDuration > 0 ? (
              <Text style={tw`text-sm font-inter text-neutral-400 font-bold`}>
                {(() => {
                  const { minutes, seconds } =
                    convertSecondsToHHMM(totalDuration);
                  if (minutes > 0) {
                    return `${minutes} minutes, ${seconds} seconds`;
                  }
                  return `${seconds} seconds`;
                })()}
              </Text>
            ) : (
              <Text style={tw`text-sm font-inter text-neutral-400`}>
                At your discretion
              </Text>
            )}
          </View>
        </View>
      </TrayScreen>
    );
  }

  if (isDoubleInhale) {
    const doubleVal = (value as number[] | undefined) ?? [1.5, 0.3, 1.5];
    const doubleLabels = ["First Inhale", "Pause", "Second Inhale"];
    const totalSec = doubleVal.reduce((a, v) => a + v, 0);

    return (
      <TrayScreen trayHeight={380 + bottom}>
        <View style={tw`pt-4 px-2 pb-4`}>
          <Text style={tw`text-base font-inter text-white text-center`}>
            Double Inhale
          </Text>

          <View style={tw`gap-y-6 my-4`}>
            {doubleLabels.map((label, index) => (
              <View key={`di-${index}`}>
                <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                  {label}
                </Text>
                <HorizontalDial
                  min={0}
                  max={10}
                  step={0.1}
                  suffix="s"
                  defaultValue={doubleVal[index] ?? 0}
                  onChange={(newValue: number) => {
                    dispatch(
                      updateExerciseStepValue({
                        exerciseId,
                        stepId,
                        value: doubleVal.map((v, i) =>
                          i === index
                            ? new Decimal(newValue)
                                .toDecimalPlaces(1)
                                .toNumber()
                            : v,
                        ),
                      }),
                    );
                  }}
                />
              </View>
            ))}
          </View>
          <View style={tw`mt-3 items-center`}>
            <Text style={tw`text-sm font-inter text-neutral-400`}>
              {`${totalSec.toFixed(1)}s total`}
            </Text>
          </View>
        </View>
      </TrayScreen>
    );
  }

  if (isRepeat) {
    const lookback = (value as number[] | undefined)?.[0] ?? 1;

    return (
      <TrayScreen trayHeight={350 + bottom}>
        <View style={tw`pt-4 px-2 pb-4`}>
          <Text style={tw`text-base font-inter text-white text-center`}>
            Repeat
          </Text>

          <View style={tw`gap-y-6 my-4`}>
            <View>
              <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                Lookback
              </Text>
              <HorizontalDial
                min={1}
                max={20}
                step={1}
                suffix=" steps"
                defaultValue={lookback}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepValue({
                      exerciseId,
                      stepId,
                      value: [Math.round(newValue)],
                    }),
                  );
                }}
              />
            </View>

            <View>
              <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                Count
              </Text>
              <HorizontalDial
                min={1}
                max={1000}
                step={1}
                suffix="x"
                defaultValue={count ?? 1}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepCount({
                      exerciseId,
                      stepId,
                      count: Math.round(newValue),
                    }),
                  );
                }}
              />
            </View>

            <View
              style={!count || count <= 1 ? tw`opacity-50` : undefined}
              pointerEvents={!count || count <= 1 ? "none" : "auto"}
            >
              <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                Ramp
              </Text>
              <HorizontalDial
                min={1}
                max={3}
                step={0.1}
                suffix="x"
                defaultValue={step?.ramp ?? 1}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepRamp({
                      exerciseId,
                      stepId,
                      ramp: new Decimal(newValue)
                        .toDecimalPlaces(1)
                        .toNumber(),
                    }),
                  );
                }}
              />
            </View>
          </View>
        </View>
      </TrayScreen>
    );
  }

  if (isText) {
    return <AdjustTextStep step={step!} exerciseId={exerciseId} stepId={stepId} bottom={bottom} />;
  }

  return (
    <TrayScreen trayHeight={250 + bottom}>
      <View style={tw`pt-4 px-2`}>
        <Text style={tw`text-base font-inter text-white text-center`}>
          {capitalize(type)}
        </Text>

        {isSingle ? (
          <View style={tw`gap-y-6 my-4`}>
            <View>
              <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                Duration
              </Text>
              <HorizontalDial
                min={0}
                max={1000}
                step={1}
                suffix="s"
                zeroLabel="∞"
                defaultValue={count ?? 0}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepCount({
                      exerciseId,
                      stepId,
                      count: Math.round(newValue),
                    }),
                  );
                }}
              />
            </View>

            <View
              style={!count ? tw`opacity-50` : undefined}
              pointerEvents={!count ? "none" : "auto"}
            >
              <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                Ramp
              </Text>
              <HorizontalDial
                min={1}
                max={3}
                step={0.1}
                suffix="x"
                defaultValue={step?.ramp ?? 1}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepRamp({
                      exerciseId,
                      stepId,
                      ramp: new Decimal(newValue)
                        .toDecimalPlaces(1)
                        .toNumber(),
                    }),
                  );
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </TrayScreen>
  );
};

const AdjustTextStep = ({
  step,
  exerciseId,
  stepId,
  bottom,
}: {
  step: Exercise["seq"][number];
  exerciseId: string;
  stepId: string;
  bottom: number;
}) => {
  const dispatch = useAppDispatch();
  const [text, setText] = useState(step.text ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const textRef = useRef(text);

  useEffect(
    () => () => {
      dispatch(
        updateExerciseStepText({
          exerciseId,
          stepId,
          text: textRef.current,
        }),
      );
    },
    [],
  );

  return (
    <TrayScreen trayHeight={500 + bottom}>
      <ScrollView
        style={tw`pt-4 px-2 pb-4`}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={false}
      >
        <View style={tw`flex-row justify-between items-center`}>
          <Text style={tw`text-base font-inter text-white`}>
            Message
          </Text>
          <Pressable onPress={Keyboard.dismiss} hitSlop={8}>
            <Text style={[tw`text-sm font-inter`, { color: isFocused ? "#6FE7FF" : "#a3a3a3" }]}>Done</Text>
          </Pressable>
        </View>

        <View style={tw`gap-y-6 my-4`}>
          <View style={tw`border-b border-neutral-800`}>
            <TextInput
              style={tw`text-base font-inter text-white py-2`}
              value={text}
              onChangeText={(val) => {
                setText(val);
                textRef.current = val;
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoFocus={!step.text}
              placeholder="Enter message"
              placeholderTextColor="#737373"
              multiline
            />
          </View>

          <View>
            <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
              Duration
            </Text>
            <HorizontalDial
              min={0}
              max={1000}
              step={1}
              suffix="s"
              zeroLabel="∞"
              defaultValue={step.count ?? 0}
              onChange={(newValue: number) => {
                dispatch(
                  updateExerciseStepCount({
                    exerciseId,
                    stepId,
                    count: Math.round(newValue),
                  }),
                );
              }}
            />
          </View>

          <View
            style={!step.count ? tw`opacity-50` : undefined}
            pointerEvents={!step.count ? "none" : "auto"}
          >
            <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
              Ramp
            </Text>
            <HorizontalDial
              min={1}
              max={3}
              step={0.1}
              suffix="x"
              defaultValue={step.ramp ?? 1}
              onChange={(newValue: number) => {
                dispatch(
                  updateExerciseStepRamp({
                    exerciseId,
                    stepId,
                    ramp: new Decimal(newValue)
                      .toDecimalPlaces(1)
                      .toNumber(),
                  }),
                );
              }}
            />
          </View>
        </View>
      </ScrollView>
    </TrayScreen>
  );
};
