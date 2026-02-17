import React, { useMemo } from "react";
import { TrayScreen } from "../../components/TrayScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text } from "react-native";
import tw from "../../utils/tw";
import { RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { exerciseByIdSelector } from "../../state/exercises.selectors";
import { capitalize } from "lodash";
import {
  updateExerciseStepCount,
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
  const isSingle = type === "exhale" || type === "hold" || type === "inhale";

  const totalDuration = useMemo(() => {
    if (!isBreath || !Array.isArray(value) || !count) return null;
    const sum = value.reduce((acc: number, v: number) => acc + v, 0);
    return count * sum;
  }, [isBreath, value, count]);

  if (isBreath) {
    return (
      <TrayScreen trayHeight={500 + bottom}>
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

  return (
    <TrayScreen trayHeight={180 + bottom}>
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
          </View>
        ) : null}
      </View>
    </TrayScreen>
  );
};
