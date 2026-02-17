import React, { memo, useMemo } from "react";
import { Text, View } from "react-native";
import { MotiView } from "moti";
import Animated from "react-native-reanimated";
import tw from "../../utils/tw";
import { AnimatePresence } from "moti";
import { runOnJS } from "react-native-reanimated";
import { BreathRing } from "./BreathRing";
import { Backdrop } from "./Backdrop";
import { Directions, Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppSelector } from "../../hooks/store";
import { exercisesSelector } from "../../state/exercises.selectors";
import { useExerciseEngine } from "../../hooks/useExerciseEngine";

export const DynamicExercise = memo(
  ({
    onPause,
  }: {
    onPause?: (value: boolean) => void;
  }) => {
    const exercises = useAppSelector(exercisesSelector);
    const { bottom } = useSafeAreaInsets();

    const {
      label,
      sublabel,
      isBreathing,
      isText,
      isHIE,
      exerciseName,
      iBreath,
      handleTap,
      handleDoubleTap,
      handleLongPress,
      handleNextExercise,
    } = useExerciseEngine({ exercises, onPause });

    const singleTap = useMemo(
      () =>
        Gesture.Tap().onEnd((_, success) => {
          if (!success) return;
          runOnJS(handleTap)();
        }),
      [handleTap],
    );

    const doubleTap = useMemo(
      () =>
        Gesture.Tap()
          .numberOfTaps(2)
          .onEnd((_, success) => {
            if (!success) return;
            runOnJS(handleDoubleTap)();
          }),
      [handleDoubleTap],
    );

    const longPress = useMemo(
      () =>
        Gesture.LongPress().onEnd((_, success) => {
          if (!success) return;
          runOnJS(handleLongPress)();
        }),
      [handleLongPress],
    );

    const swipeUp = useMemo(
      () =>
        Gesture.Fling()
          .direction(Directions.UP)
          .onEnd((_, success) => {
            if (!success) return;
            runOnJS(handleNextExercise)(1);
          }),
      [handleNextExercise],
    );

    const swipeDown = useMemo(
      () =>
        Gesture.Fling()
          .direction(Directions.DOWN)
          .onEnd((_, success) => {
            if (!success) return;
            runOnJS(handleNextExercise)(-1);
          }),
      [handleNextExercise],
    );

    return (
      <GestureDetector
        gesture={Gesture.Exclusive(
          swipeUp,
          swipeDown,
          doubleTap,
          longPress,
          singleTap,
        )}
      >
        <Animated.View style={tw`absolute inset-0 bg-transparent`}>
          <View style={tw`absolute inset-0 justify-center items-center z-0`}>
            {isHIE && <Backdrop />}
            {isBreathing && <BreathRing breath={iBreath} />}
          </View>
          <View style={tw`absolute inset-0 items-center justify-center`}>
            <AnimatePresence exitBeforeEnter>
              <View
                style={[
                  tw`items-center justify-center`,
                  {
                    height: isText ? 144 : 96,
                    width: isText ? 144 : 96,
                  },
                ]}
              >
                <Text
                  style={[
                    tw`${
                      isText ? "text-sm" : "text-base"
                    } font-inter text-neutral-200 text-center mb-2`,
                    { fontVariant: ["tabular-nums"] },
                  ]}
                >
                  {label}
                </Text>
                {!isText ? (
                  <View style={tw`absolute left-0 right-0 bottom-[22px]`}>
                    <Text
                      style={[
                        tw`text-xs font-inter text-neutral-400 text-center`,
                        { fontVariant: ["tabular-nums"] },
                      ]}
                    >
                      {sublabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </AnimatePresence>
          </View>

          <AnimatePresence>
            {exerciseName && (
              <MotiView
                key={exerciseName}
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ opacity: { type: "timing", duration: 500 } }}
                style={[
                  tw`absolute left-0 right-0 justify-center items-center`,
                  {
                    bottom: bottom + 16,
                  },
                ]}
              >
                <View style={tw`px-6 py-2 rounded-xl bg-black`}>
                  <Text style={tw`text-neutral-200 text-xs font-inter`}>
                    {exerciseName}
                  </Text>
                </View>
              </MotiView>
            )}
          </AnimatePresence>
        </Animated.View>
      </GestureDetector>
    );
  },
);
