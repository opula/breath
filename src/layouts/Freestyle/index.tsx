import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";

import tw from "../../utils/tw";
import { HorizontalDial } from "../../components/HorizontalDial";
import { Overline } from "../../components/Overline";
import { AppSheet, AppSheetHandle } from "../../components/AppSheet";
import { MainStackParams, type FreestyleRatio } from "../../navigation";

type Nav = StackNavigationProp<MainStackParams, "Freestyle">;

const DEFAULT_RATIO: FreestyleRatio = "1:1";
const RATIOS: FreestyleRatio[] = ["2:1", "1:1", "1:2", "1:3"];

export const Freestyle = () => {
  const navigation = useNavigation<Nav>();
  const [selectedRatio, setSelectedRatio] =
    useState<FreestyleRatio>(DEFAULT_RATIO);
  const [selectedMinutes, setSelectedMinutes] = useState(0);

  const sheetRef = useRef<AppSheetHandle>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  const timerLabel = useMemo(() => {
    if (!selectedMinutes) return "None";
    return `${selectedMinutes} minute${selectedMinutes === 1 ? "" : "s"}`;
  }, [selectedMinutes]);

  const handleStart = () => {
    pendingAction.current = () =>
      navigation.navigate("FreestyleSession", {
        ratio: selectedRatio,
        timerMinutes: selectedMinutes || undefined,
      });
    sheetRef.current?.dismiss();
  };

  return (
    <AppSheet
      ref={sheetRef}
      onDismissed={() => {
        pendingAction.current?.();
        pendingAction.current = null;
      }}
    >
      <View style={tw`px-2 pt-3 pb-2`}>
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
            zeroLabel="none"
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
    </AppSheet>
  );
};
