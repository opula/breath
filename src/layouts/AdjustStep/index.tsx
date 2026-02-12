import React, { useMemo, useState } from "react";
import { TrayScreen } from "../../components/TrayScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";
import { NavigationProp, RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  exerciseByIdSelector,
  exercisesByIdSelector,
} from "../../state/exercises.selectors";
import { capitalize, isArray, isNumber } from "lodash";
import {
  updateExerciseStepCount,
  updateExerciseStepValue,
} from "../../state/exercises.reducer";
import Decimal from "decimal.js";
import { NumberWheelPicker } from "../../components/NumberWheelPicker";

interface Props {
  navigation: NavigationProp<MainStackParams, "AdjustStep">;
  route: RouteProp<MainStackParams, "AdjustStep">;
}

export const AdjustStep = ({ navigation, route }: Props) => {
  const { exerciseId, stepId } = route.params;
  const { bottom } = useSafeAreaInsets();
  const exercise = useAppSelector((state) =>
    exerciseByIdSelector(state, exerciseId)
  );
  const dispatch = useAppDispatch();

  const step = useMemo(
    () => exercise.seq.find((step) => step.id === stepId),
    [exercise, stepId]
  );
  const { type, value, count, text } = step || {};

  const [selectedPart, setSelectedPart] = useState(0);
  const [updatedValue, setUpdatedValue] = useState<number | undefined>(
    isArray(value) ? value[0] : undefined
  );
  const [updatedCount, setUpdatedCount] = useState<number | undefined>(count);

  const isBreath = type === "breath";
  const isSingle = type === "exhale" || type === "hold" || type === "inhale";

  return (
    <TrayScreen trayHeight={(isBreath ? 440 : 240) + bottom}>
      <View style={tw`pt-6 px-2 flex-1 items-center`}>
        <Text style={tw`text-base font-lusitana text-white`}>
          {capitalize(type)}
        </Text>

        {isBreath ? (
          <>
            <View style={tw`mt-4 flex-row items-center justify-center`}>
              <Pressable
                style={tw`h-10 flex-1 mx-1`}
                onPress={() => {
                  setSelectedPart(0);
                  setUpdatedValue((value as number[])[0]);
                }}
              >
                <Text
                  style={tw`text-center text-xs font-lusitana ${
                    selectedPart === 0 ? "text-blue-500" : "text-white"
                  }`}
                >{`Inhale (${(value as number[])[0]}s)`}</Text>
              </Pressable>
              <Pressable
                style={tw`h-10 flex-1 mx-1`}
                onPress={() => {
                  setSelectedPart(1);
                  setUpdatedValue((value as number[])[1]);
                }}
              >
                <Text
                  style={tw`text-center text-xs font-lusitana ${
                    selectedPart === 1 ? "text-blue-500" : "text-white"
                  }`}
                >{`Hold (${(value as number[])[1]}s)`}</Text>
              </Pressable>
              <Pressable
                style={tw`h-10 flex-1 mx-1`}
                onPress={() => {
                  setSelectedPart(2);
                  setUpdatedValue((value as number[])[2]);
                }}
              >
                <Text
                  style={tw`text-center text-xs font-lusitana ${
                    selectedPart === 2 ? "text-blue-500" : "text-white"
                  }`}
                >{`Exhale (${(value as number[])[2]}s)`}</Text>
              </Pressable>
              <Pressable
                style={tw`h-10 flex-1 mx-1`}
                onPress={() => {
                  setSelectedPart(3);
                  setUpdatedValue((value as number[])[3]);
                }}
              >
                <Text
                  style={tw`text-center text-xs font-lusitana ${
                    selectedPart === 3 ? "text-blue-500" : "text-white"
                  }`}
                >{`Hold (${(value as number[])[3]}s)`}</Text>
              </Pressable>
            </View>

            <NumberWheelPicker
              key={`value-${selectedPart}`}
              min={0}
              max={300}
              step={0.1}
              defaultValue={isNumber(updatedValue) ? updatedValue : 0}
              onChange={(newValue: number) => {
                dispatch(
                  updateExerciseStepValue({
                    exerciseId,
                    stepId,
                    value: value!.map((v, i) =>
                      i === selectedPart
                        ? new Decimal(newValue).toDecimalPlaces(1).toNumber()
                        : v
                    ),
                  })
                );
              }}
            />

            <Text style={tw`text-base font-lusitana text-white mt-6`}>
              Count
            </Text>
            <NumberWheelPicker
              key={`count-${selectedPart}`}
              min={0}
              max={1000}
              step={1}
              isCount
              defaultValue={isNumber(updatedCount) ? updatedCount : 0}
              onChange={(newValue: number) => {
                dispatch(
                  updateExerciseStepCount({
                    exerciseId,
                    stepId,
                    count: new Decimal(newValue).toDecimalPlaces(0).toNumber(),
                  })
                );
              }}
            />
          </>
        ) : null}

        {isSingle ? (
          <>
            <View style={tw`items-center justify-center`}>
              <Text style={tw`text-base font-lusitana text-white mt-8`}>
                Count
              </Text>
              <NumberWheelPicker
                key={`${selectedPart}`}
                min={0}
                max={1000}
                step={1}
                isCount
                defaultValue={isNumber(updatedCount) ? updatedCount : 0}
                onChange={(newValue: number) => {
                  dispatch(
                    updateExerciseStepCount({
                      exerciseId,
                      stepId,
                      count: new Decimal(newValue)
                        .toDecimalPlaces(0)
                        .toNumber(),
                    })
                  );
                }}
              />
            </View>
          </>
        ) : null}
      </View>
    </TrayScreen>
  );
};
