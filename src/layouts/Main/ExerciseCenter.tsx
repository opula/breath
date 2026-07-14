import React, { memo } from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  withTiming,
  type LayoutAnimationFunction,
  type SharedValue,
} from "react-native-reanimated";
import { use$ } from "concordia/react";
import tw from "../../utils/tw";
import { BreathRing } from "../../components/DynamicExercise/BreathRing";
import { session$ } from "../../state/session.atom";

// Layout transition for the center cluster: tween ONLY vertical position, so
// the cluster glides when a line mounts/unmounts (2 -> 3 lines) but plain text
// swaps (inhale -> exhale change the frame width) snap with no animation.
const centerShift: LayoutAnimationFunction = (values) => {
  "worklet";
  return {
    initialValues: {
      originX: values.targetOriginX,
      originY: values.currentOriginY,
      width: values.targetWidth,
      height: values.targetHeight,
    },
    animations: {
      originY: withTiming(values.targetOriginY, { duration: 400 }),
    },
  };
};

/**
 * The label / countdown / round cluster of a guided session. Subscribes to
 * the engine display atom itself, so per-second countdown ticks re-render
 * only this small tree — never the hosting screen.
 */
export const ExerciseCenter = memo(
  ({
    breath,
    isAppActive,
  }: {
    breath: SharedValue<number>;
    isAppActive: boolean;
  }) => {
    const label = use$(session$.label);
    const sublabel = use$(session$.sublabel);
    const isText = use$(session$.isText);
    const isBreathing = use$(session$.isBreathing);
    const repeatProgress = use$(session$.repeatProgress);

    // Persistent round progress while inside a repeat block (e.g. "round 3 / 30").
    // Status, not chrome: it stays through the chrome fade, like the ring itself.
    // Fades in/out; the cluster container tweens its re-centering (centerShift).
    const renderRepeatProgress = (topMargin: number) =>
      repeatProgress ? (
        <Animated.Text
          entering={FadeIn.duration(400)}
          exiting={FadeOut.duration(400)}
          style={[
            tw`font-mono text-mb-mute uppercase text-[9px] text-center`,
            { letterSpacing: 1.8, marginTop: topMargin },
          ]}
        >
          round {repeatProgress.round} / {repeatProgress.total}
        </Animated.Text>
      ) : null;

    if (isText) {
      return (
        <Animated.View layout={centerShift} style={tw`px-8 items-center`}>
          <Text
            style={[
              tw`font-display text-mb-fg uppercase text-center`,
              { fontSize: 32, letterSpacing: -0.5, lineHeight: 38 },
            ]}
          >
            {label}
          </Text>
          {renderRepeatProgress(12)}
        </Animated.View>
      );
    }

    if (!label) return null;

    return (
      <View style={tw`items-center justify-center`}>
        {isAppActive && isBreathing ? <BreathRing breath={breath} /> : null}
        <Animated.View
          layout={centerShift}
          style={tw`absolute items-center justify-center`}
          pointerEvents="none"
        >
          <Text
            style={[
              tw`font-display text-mb-fg uppercase text-center`,
              { fontSize: 16, letterSpacing: -0.3 },
            ]}
          >
            {label}
          </Text>
          {/* During a repeat block the time slot is always reserved, so
              the round line keeps a stable third position instead of
              jumping up on phases without a countdown. */}
          {sublabel || repeatProgress ? (
            <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px] mt-2`,
                { letterSpacing: 2 },
              ]}
            >
              {sublabel || " "}
            </Text>
          ) : null}
          {renderRepeatProgress(8)}
        </Animated.View>
      </View>
    );
  },
);
