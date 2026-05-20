import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import tw from "../../utils/tw";
import { HorizontalDial } from "../../components/HorizontalDial";
import { Overline } from "../../components/Overline";
import { MainStackParams, type FreestyleRatio } from "../../navigation";

type Nav = StackNavigationProp<MainStackParams, "Freestyle">;

const TRAY_HEIGHT = 520;
const DEFAULT_RATIO: FreestyleRatio = "1:1";
const RATIOS: FreestyleRatio[] = ["2:1", "1:1", "1:2", "1:3"];

export const Freestyle = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [selectedRatio, setSelectedRatio] =
    useState<FreestyleRatio>(DEFAULT_RATIO);
  const [selectedMinutes, setSelectedMinutes] = useState(0);

  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);
  const trayHeight = TRAY_HEIGHT + insets.bottom;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const dismiss = () => {
    translateY.value = withTiming(trayHeight, { duration: 200 });
    setTimeout(() => navigation.goBack(), 200);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(
        0,
        Math.min(startY.value + e.translationY, trayHeight),
      );
    })
    .onEnd(() => {
      const shouldDismiss = translateY.value > 80;
      translateY.value = withTiming(shouldDismiss ? trayHeight : 0, {
        duration: 200,
      });
      if (shouldDismiss) runOnJS(navigation.goBack)();
    });

  const timerLabel = useMemo(() => {
    if (!selectedMinutes) return "open";
    return `${selectedMinutes} minute${selectedMinutes === 1 ? "" : "s"}`;
  }, [selectedMinutes]);

  const handleStart = () => {
    translateY.value = withTiming(trayHeight, { duration: 200 });
    setTimeout(() => {
      navigation.goBack();
      setTimeout(
        () =>
          navigation.navigate("FreestyleSession", {
            ratio: selectedRatio,
            timerMinutes: selectedMinutes || undefined,
          }),
        50,
      );
    }, 200);
  };

  return (
    <View style={tw`flex-1 justify-end`}>
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

      <Animated.View
        style={[
          animatedStyle,
          tw`bg-mb-bg border-t border-mb-line`,
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <Animated.View style={tw`justify-center items-center h-10 w-full`}>
            <View style={tw`h-1 w-10 bg-mb-dim rounded-full mt-3`} />
          </Animated.View>
        </GestureDetector>

        <View style={tw`px-6 pb-5 border-b border-mb-line`}>
          <Overline accent right={timerLabel}>
            Freestyle
          </Overline>
          <View style={tw`mt-3`}>
            <Text
              style={[
                tw`font-display uppercase text-mb-fg text-[28px]`,
                { letterSpacing: -1 },
              ]}
              numberOfLines={1}
            >
              Ratio {selectedRatio}
            </Text>
          </View>
        </View>

        <View style={tw`px-6 pt-5`}>
          <Overline>Ratio</Overline>
          <View style={tw`flex-row mt-4 mb-6`}>
            {RATIOS.map((ratio) => {
              const selected = ratio === selectedRatio;
              return (
                <Pressable
                  key={ratio}
                  onPress={() => setSelectedRatio(ratio)}
                  style={({ pressed }) => [
                    tw`flex-1 items-center py-3 border border-mb-line`,
                    selected && tw`border-mb-accent bg-mb-bg-elev`,
                    pressed && tw`opacity-70`,
                  ]}
                >
                  <Text
                    style={[
                      tw`font-display uppercase text-[18px]`,
                      selected ? tw`text-mb-accent` : tw`text-mb-fg`,
                      { letterSpacing: -0.4 },
                    ]}
                  >
                    {ratio}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Overline>Timer</Overline>
          <View style={tw`mt-4`}>
            <HorizontalDial
              min={0}
              max={90}
              step={1}
              suffix="min"
              zeroLabel="open"
              defaultValue={0}
              onChange={(value) => setSelectedMinutes(Math.round(value))}
            />
          </View>

          <View style={tw`mt-7`}>
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [
                tw`flex-row items-center py-4 border-t border-b border-mb-line`,
                pressed && tw`opacity-70`,
              ]}
            >
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute w-8`,
                  { letterSpacing: 1.5 },
                ]}
              >
                01
              </Text>
              <View style={tw`flex-1`}>
                <Text
                  style={[
                    tw`font-display uppercase text-[20px] text-mb-accent`,
                    { letterSpacing: -0.5 },
                  ]}
                >
                  Start freestyle
                </Text>
                <Text
                  style={[
                    tw`font-mono text-[9px] text-mb-mute uppercase mt-1`,
                    { letterSpacing: 1.8 },
                  ]}
                >
                  {selectedRatio} · {timerLabel}
                </Text>
              </View>
              <Text style={tw`font-mono text-[14px] text-mb-accent`}>▶</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};
