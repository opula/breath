import React from "react";
import { Exercise } from "../../types/exercise";
import { Text, Pressable, View } from "react-native";
import tw from "../../utils/tw";
import { sum } from "lodash";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";

const stepDisplayName = (type: string) => {
  if (type === "double-inhale") return "Double inhale";
  if (type === "repeat") return "Repeat";
  if (type === "text") return "Message";
  return type;
};

const formatValues = (values: number[]) =>
  values
    .map((v) => {
      const rounded = Math.round(v * 10) / 10;
      return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
    })
    .join(" · ");

interface Props {
  exerciseId: string;
  step: Exercise["seq"][number];
  index: number;
  drag: () => void;
}

export const StepCard = ({ exerciseId, step, index, drag }: Props) => {
  const navigation =
    useNavigation<NavigationProp<MainStackParams, "Exercise">>();
  const { id, type, value, count, text, ramp } = step;

  // Build the right-aligned primary readout.
  let primary: string;
  if (type === "breath" && Array.isArray(value)) {
    primary = `${formatValues(value)}s`;
  } else if (type === "double-inhale" && Array.isArray(value)) {
    primary = `${formatValues(value)}s`;
  } else if (type === "repeat") {
    primary = `${count ?? 1}×`;
  } else if (type === "text") {
    primary = count ? `${count}s` : "∞";
  } else {
    // inhale / exhale / hold
    primary = count ? `${count}s` : "∞";
  }

  // Build an optional subtitle with count/ramp/etc. Kept terse so it never
  // competes with the primary label visually.
  const subParts: string[] = [];
  if (type === "breath" && count) {
    subParts.push(`${count}× repetitions`);
  } else if (type === "repeat" && Array.isArray(value)) {
    subParts.push(`lookback ${value[0] ?? 1}`);
  } else if (type === "text" && text) {
    subParts.push(`"${text}"`);
  }
  if (ramp && ramp > 1) subParts.push(`ramp ${ramp}×`);
  const subtitle = subParts.join(" · ");

  return (
    <Pressable
      style={({ pressed }) => [
        tw`flex-row items-center py-5 border-b border-mb-line`,
        pressed && tw`opacity-70`,
      ]}
      onLongPress={drag}
      onPress={() =>
        navigation.navigate("AdjustStep", { exerciseId, stepId: id })
      }
    >
      <Text
        style={[
          tw`font-mono text-[10px] text-mb-mute uppercase w-8`,
          { letterSpacing: 1.5 },
        ]}
      >
        {String(index + 1).padStart(2, "0")}
      </Text>

      <View style={tw`flex-1`}>
        <Text
          style={[
            tw`font-item text-[18px] text-mb-ink`,
          ]}
          numberOfLines={1}
        >
          {stepDisplayName(type)}
        </Text>
        {subtitle ? (
          <Text
            style={[
              tw`font-mono text-[9px] text-mb-mute uppercase mt-1`,
              { letterSpacing: 1.8 },
            ]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Text
        style={[
          tw`font-item text-[15px] text-mb-accent ml-3`,
        ]}
        numberOfLines={1}
      >
        {primary}
      </Text>
    </Pressable>
  );
};
