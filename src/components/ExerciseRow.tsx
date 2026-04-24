import React from "react";
import { View, Text, Pressable } from "react-native";
import tw from "../utils/tw";
import { Exercise } from "../types/exercise";

interface Props {
  exercise: Exercise;
  index: number;
  isFavorite?: boolean;
  isLastPlayed?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

export const ExerciseRow = ({
  exercise,
  index,
  isFavorite = false,
  isLastPlayed = false,
  onPress,
  onLongPress,
}: Props) => {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={({ pressed }) => [
        tw`flex-row items-center py-5 border-b border-mb-line`,
        pressed && tw`opacity-70`,
      ]}
    >
      {/* Last-played marker (or spacer to keep columns aligned) */}
      {/* <View style={tw`w-3 items-center`}>
        {isLastPlayed ? (
          <View style={tw`w-[5px] h-[5px] rounded-full bg-mb-accent`} />
        ) : null}
      </View> */}

      {/* Numeric index */}
      <Text
        style={[
          tw`font-mono text-[10px] text-mb-mute uppercase w-8`,
          { letterSpacing: 1.5 },
        ]}
      >
        {String(index + 1).padStart(2, "0")}
      </Text>

      {/* Name + favorite star */}
      <View style={tw`flex-1 flex-row items-center`}>
        <Text
          style={[
            tw.style(
              `font-display text-[22px] text-mb-fg uppercase`,
              isLastPlayed ? `text-mb-accent` : undefined,
            ),
            { letterSpacing: -0.5 },
          ]}
          numberOfLines={1}
        >
          {exercise.name}
        </Text>
        {isFavorite ? (
          <Text style={tw`text-mb-accent text-sm ml-2`}>★</Text>
        ) : null}
      </View>
    </Pressable>
  );
};
