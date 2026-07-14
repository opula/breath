import React, { memo, useCallback, useState } from "react";
import { MotiView } from "moti";
import type { SharedValue } from "react-native-reanimated";
import tw from "../../utils/tw";
import { configuration$ } from "../../state/configuration.atom";
import { use$ } from "concordia/react";
import {
  backgroundSourceById,
  DEFAULT_BACKGROUND_SOURCE_ID,
  NO_BACKGROUND_SOURCE_ID,
  type BackgroundSourceId,
} from "./sources";

export const BackgroundSurface = ({
  isGrayscale,
  sourceId,
  breath,
  onReady,
}: {
  isGrayscale: boolean;
  sourceId: BackgroundSourceId;
  breath?: SharedValue<number>;
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
      <ActiveBackground
        grayscale={isGrayscale}
        breath={breath}
        onReady={handleReady}
      />
    </MotiView>
  );
};

export const Background = memo(
  ({ breath }: { breath?: SharedValue<number> }) => {
    const isGrayscale = use$(configuration$.isGrayscale);
    const sourceId = use$(configuration$.bgSourceId);

    if (sourceId === NO_BACKGROUND_SOURCE_ID) {
      return null;
    }

    return (
      <BackgroundSurface
        key={sourceId}
        isGrayscale={isGrayscale}
        sourceId={sourceId}
        breath={breath}
      />
    );
  },
);
