import React from "react";
import { Text, View } from "react-native";
import { MotiView } from "moti";
import tw from "../utils/tw";
import { useAppSelector } from "../hooks/store";
import { hasSeenTutorialSelector } from "../state/configuration.selectors";

export const CoachOverlay = () => {
  const hasSeenTutorial = useAppSelector(hasSeenTutorialSelector);

  if (hasSeenTutorial) return null;

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { type: "timing", duration: 300 } }}
      style={tw`absolute inset-0`}
      pointerEvents="none"
    >
      <View style={tw`flex-1 bg-black/45 items-center justify-center`}>
        <View style={tw`items-center`}>
          <Text
            style={tw`text-lg text-center font-inter text-neutral-200 mb-4`}
          >
            {`Tap to start\nyour first exercise`}
          </Text>
          <Text style={tw`text-xs font-inter text-neutral-400`}>
            Double tap to pause
          </Text>
        </View>
      </View>
    </MotiView>
  );
};
