import React, { memo } from "react";
import { MotiView } from "moti";
import tw from "../../utils/tw";
import { Wormhole } from "../../backgrounds/Wormhole";

export const Background = memo(() => {
  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { type: "timing", duration: 300 } }}
      style={tw`flex-1`}
    >
      <Wormhole />
    </MotiView>
  );
});
