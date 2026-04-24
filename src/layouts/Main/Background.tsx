import React, { memo } from "react";
import { MotiView } from "moti";
import tw from "../../utils/tw";
import { useAppSelector } from "../../hooks/store";
import {
  isGrayscaleSelector,
  sourceIdSelector,
} from "../../state/configuration.selectors";
import {
  backgroundSourceById,
  DEFAULT_BACKGROUND_SOURCE_ID,
  NO_BACKGROUND_SOURCE_ID,
} from "./sources";

export const Background = memo(() => {
  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const sourceId = useAppSelector(sourceIdSelector);

  if (sourceId === NO_BACKGROUND_SOURCE_ID) {
    return null;
  }

  const ActiveBackground =
    backgroundSourceById[sourceId]?.Component ??
    backgroundSourceById[DEFAULT_BACKGROUND_SOURCE_ID].Component;

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
