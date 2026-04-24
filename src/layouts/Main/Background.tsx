import React, { memo, useCallback, useState } from "react";
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
  type BackgroundSourceId,
} from "./sources";

export const BackgroundSurface = ({
  isGrayscale,
  sourceId,
  onReady,
}: {
  isGrayscale: boolean;
  sourceId: BackgroundSourceId;
  onReady?: () => void;
}) => {
  const [isReady, setIsReady] = useState(false);
  const handleReady = useCallback(() => {
    setIsReady(true);
    onReady?.();
  }, [onReady]);
  const ActiveBackground =
    backgroundSourceById[sourceId]?.Component ??
    backgroundSourceById[DEFAULT_BACKGROUND_SOURCE_ID].Component;

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: isReady ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { type: "timing", duration: 300 } }}
      style={tw`flex-1`}
    >
      <ActiveBackground grayscale={isGrayscale} onReady={handleReady} />
    </MotiView>
  );
};

export const Background = memo(() => {
  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const sourceId = useAppSelector(sourceIdSelector);

  if (sourceId === NO_BACKGROUND_SOURCE_ID) {
    return null;
  }

  return (
    <BackgroundSurface
      key={sourceId}
      isGrayscale={isGrayscale}
      sourceId={sourceId}
    />
  );
});
