import React, { memo } from "react";
import { MotiView } from "moti";
import tw from "../../utils/tw";
import { Aurora } from "../../backgrounds/Aurora";
import { Wormhole } from "../../backgrounds/Wormhole";
import { Starfield } from "../../backgrounds/Starfield";
import { Rorschach } from "../../backgrounds/Rorschach";
import { Waves } from "../../backgrounds/Waves";
import { Circular } from "../../backgrounds/Circular";
import { Echo } from "../../backgrounds/Echo";

export const Background = memo(() => {
  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { type: "timing", duration: 300 } }}
      style={tw`flex-1`}
    >
      <Echo />
      {/* <Circular /> */}
      {/* <Waves /> */}
      {/* <Rorschach /> */}
      {/* <Starfield /> */}
      {/* <Aurora /> */}
      {/* <Wormhole /> */}
    </MotiView>
  );
});
