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
import { DitherPulse } from "../../backgrounds/DitherPulse";
import { Particles } from "../../backgrounds/Particles";
import { Terrain } from "../../backgrounds/Terrain";
import { DotGrid } from "../../backgrounds/DotGrid";
import { GameOfLife } from "../../backgrounds/GameOfLife";
import { SinPulse } from "../../backgrounds/SinPulse";
import { useAppSelector } from "../../hooks/store";
import {
  isGrayscaleSelector,
  sourceIndexSelector,
} from "../../state/configuration.selectors";

const BackgroundComponents = [
  Aurora,
  Circular,
  Echo,
  Rorschach,
  Starfield,
  Waves,
  Wormhole,
  DitherPulse,
  Particles,
  Terrain,
  DotGrid,
  GameOfLife,
  SinPulse,
] as const;

export const Background = memo(() => {
  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const sourceIndex = useAppSelector(sourceIndexSelector);

  const ActiveBackground = BackgroundComponents[sourceIndex] ?? Wormhole;

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { type: "timing", duration: 300 } }}
      style={tw`flex-1`}
    >
      <ActiveBackground grayscale={isGrayscale} />
    </MotiView>
  );
});
