import React, { useRef } from "react";
import { View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";
import { NavigationProp, RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { AppSheet, AppSheetHandle } from "../../components/AppSheet";
import { Exercise } from "../../types/exercise";
import uuid from "react-native-uuid";
import { useAppDispatch } from "../../hooks/store";
import { addExerciseStep } from "../../state/exercises.reducer";
import { Overline } from "../../components/Overline";

interface Props {
  navigation: NavigationProp<MainStackParams, "NewStepMenu">;
  route: RouteProp<MainStackParams, "NewStepMenu">;
}

type StepKind = Exercise["seq"][number]["type"];

const OPTIONS: {
  type: StepKind;
  label: string;
  hint: string;
}[] = [
  { type: "breath", label: "Breath cycle", hint: "four-phase inhale/hold/exhale/hold" },
  { type: "inhale", label: "Inhale", hint: "single timed inhale" },
  { type: "hold", label: "Hold", hint: "retention at current lung state" },
  { type: "exhale", label: "Exhale", hint: "single timed exhale" },
  { type: "double-inhale", label: "Double inhale", hint: "two inhales with a pause" },
  { type: "text", label: "Message", hint: "display an instructional prompt" },
  { type: "repeat", label: "Repeat", hint: "loop previous phases" },
];

export const NewStepMenu = ({ navigation, route }: Props) => {
  const { exerciseId } = route.params;
  const dispatch = useAppDispatch();
  const sheetRef = useRef<AppSheetHandle>(null);
  const pendingStepId = useRef<string | null>(null);

  const createStep = (type: StepKind) => {
    const stepId = uuid.v4() as string;
    const step = {
      id: stepId,
      type,
      count: 0,
      ...(type === "breath" ? { value: [0, 0, 0, 0] } : {}),
      ...(type === "double-inhale" ? { value: [1.5, 0.3, 1.5] } : {}),
      ...(type === "text" ? { text: "" } : {}),
      ...(type === "repeat" ? { value: [1], count: 1 } : {}),
    } as Exercise["seq"][number];

    dispatch(addExerciseStep({ exerciseId, step }));
    pendingStepId.current = stepId;
    sheetRef.current?.dismiss();
  };

  return (
    <AppSheet
      ref={sheetRef}
      onDismissed={() => {
        const stepId = pendingStepId.current;
        pendingStepId.current = null;
        if (stepId) navigation.navigate("AdjustStep", { exerciseId, stepId });
      }}
    >
      <View style={tw`pt-2 pb-2 px-2`}>
        <Overline accent right={`${OPTIONS.length} kinds`}>
          Add phase
        </Overline>
      </View>

      <View style={tw`px-2 pb-4`}>
        {OPTIONS.map((opt, i) => (
          <Pressable
            key={opt.type}
            onPress={() => createStep(opt.type)}
            style={({ pressed }) => [
              tw`flex-row items-center py-4 border-b border-mb-line`,
              pressed && tw`opacity-70`,
            ]}
          >
            <Text
              style={[
                tw`font-mono text-[10px] text-mb-mute uppercase w-8`,
                { letterSpacing: 1.5 },
              ]}
            >
              {String(i + 1).padStart(2, "0")}
            </Text>
            <View style={tw`flex-1`}>
              <Text
                style={[
                  tw`font-item text-[18px] text-mb-ink`,
                ]}
              >
                {opt.label}
              </Text>
              <Text
                style={[
                  tw`font-mono text-[9px] text-mb-mute uppercase mt-1`,
                  { letterSpacing: 1.8 },
                ]}
              >
                {opt.hint}
              </Text>
            </View>
            <Text
              style={[
                tw`font-mono text-[14px] text-mb-mute`,
              ]}
            >
              →
            </Text>
          </Pressable>
        ))}
      </View>
    </AppSheet>
  );
};
