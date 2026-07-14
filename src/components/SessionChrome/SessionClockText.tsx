import React, { memo } from "react";
import { Text } from "react-native";
import { use$ } from "concordia/react";
import tw from "../../utils/tw";
import { sessionClockText$ } from "../../state/session.atom";

/**
 * mm:ss readout for the live-session bottom chrome. Isolated so the 1 Hz
 * clock tick re-renders only this Text, never the session screen.
 */
export const SessionClockText = memo(() => {
  const text = use$(sessionClockText$);
  return (
    <Text
      style={[tw`font-mono text-mb-mute text-[10px]`, { letterSpacing: 2 }]}
    >
      {text}
    </Text>
  );
});
