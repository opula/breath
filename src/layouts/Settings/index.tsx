import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import tw from "../../utils/tw";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  isGrayscaleSelector,
  soundsEnabledSelector,
  hapticsEnabledSelector,
} from "../../state/configuration.selectors";
import {
  toggleGrayscale,
  toggleSounds,
  toggleHaptics,
} from "../../state/configuration.reducer";
import { accentColorSelector } from "../../state/accent.selectors";
import { setAccentColor } from "../../state/accent.reducer";
import { MainStackParams } from "../../navigation";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

const ACCENTS = [
  { id: "mint", hex: "#6FE7FF" },
  { id: "amber", hex: "#FFB545" },
  { id: "rose", hex: "#FF8FA3" },
  { id: "lime", hex: "#C8F26D" },
  { id: "paper", hex: "#EDEDEA" },
];

const ToggleRow = ({
  label,
  hint,
  enabled,
  onPress,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      tw`flex-row items-center py-4 border-b border-mb-line`,
      pressed && tw`opacity-70`,
    ]}
  >
    <View style={tw`flex-1`}>
      <Text
        style={[
          tw`font-display text-[18px] text-mb-fg uppercase`,
          { letterSpacing: -0.4 },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          tw`font-mono text-[9px] text-mb-mute uppercase mt-1`,
          { letterSpacing: 1.8 },
        ]}
      >
        {hint}
      </Text>
    </View>
    <View
      style={[
        tw`w-10 h-6 rounded-full justify-center px-0.5`,
        enabled ? tw`bg-mb-accent` : tw`bg-mb-dim`,
      ]}
    >
      <View
        style={[
          tw`w-5 h-5 rounded-full`,
          enabled ? tw`self-end` : tw`self-start`,
          { backgroundColor: enabled ? "#000" : "#6E6E74" },
        ]}
      />
    </View>
  </Pressable>
);

const AboutRow = ({ label, value }: { label: string; value: string }) => (
  <View style={tw`flex-row items-center py-3 border-b border-mb-line`}>
    <Text
      style={[
        tw`font-display text-[15px] text-mb-fg uppercase flex-1`,
        { letterSpacing: -0.3 },
      ]}
    >
      {label}
    </Text>
    <Text
      style={[
        tw`font-mono text-[10px] text-mb-mute uppercase`,
        { letterSpacing: 2 },
      ]}
    >
      {value}
    </Text>
  </View>
);

export const Settings = () => {
  const navigation = useNavigation<NavigationProp<MainStackParams>>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const soundsEnabled = useAppSelector(soundsEnabledSelector);
  const hapticsEnabled = useAppSelector(hapticsEnabledSelector);
  const accentColor = useAppSelector(accentColorSelector);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top nav */}
        <View style={tw`flex-row items-center justify-between px-6 py-3`}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={tw`py-2 active:opacity-60`}
          >
            <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px]`,
                { letterSpacing: 3 },
              ]}
            >
              ← back
            </Text>
          </Pressable>
          <Text
            style={[
              tw`font-mono text-mb-mute uppercase text-[10px] py-2`,
              { letterSpacing: 3 },
            ]}
          >
            settings
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Help")}
            style={tw`py-2 active:opacity-60`}
          >
            <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px]`,
                { letterSpacing: 3 },
              ]}
            >
              help
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={tw`px-6 pb-10`}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={tw`mt-2 mb-6`}>
            <Overline accent right="v1.0">
              Preferences
            </Overline>
            <View style={tw`mt-5`}>
              <BigTitle size={44} accent>{`Adjust\nyour flow`}</BigTitle>
            </View>
          </View>

          {/* Feedback group */}
          <Overline>Feedback</Overline>
          <ToggleRow
            label="Sounds"
            hint="phase transition audio cues"
            enabled={soundsEnabled}
            onPress={() => dispatch(toggleSounds())}
          />
          <ToggleRow
            label="Haptics"
            hint="a small tap on every phase change"
            enabled={hapticsEnabled}
            onPress={() => dispatch(toggleHaptics())}
          />

          {/* Display group */}
          <View style={tw`mt-8`}>
            <Overline>Display</Overline>
          </View>
          <ToggleRow
            label="Grayscale"
            hint="desaturate the ambient scene"
            enabled={isGrayscale}
            onPress={() => dispatch(toggleGrayscale())}
          />

          {/* Accent picker */}
          <View style={tw`mt-8`}>
            <Overline>Accent color</Overline>
          </View>
          <View style={tw`flex-row py-4 border-b border-mb-line`}>
            {ACCENTS.map((a) => {
              const selected = accentColor === a.hex;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => dispatch(setAccentColor(a.hex))}
                  style={({ pressed }) => [
                    tw`mr-4 items-center`,
                    pressed && tw`opacity-70`,
                  ]}
                >
                  <View
                    style={[
                      tw`w-9 h-9 rounded-full`,
                      {
                        backgroundColor: a.hex,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected
                          ? "#F2F2EF"
                          : "rgba(255,255,255,0.16)",
                      },
                      selected
                        ? {
                            shadowColor: a.hex,
                            shadowOpacity: 0.45,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 0 },
                          }
                        : null,
                    ]}
                  />
                  <Text
                    style={[
                      tw`font-mono uppercase text-[9px] mt-2`,
                      selected ? tw`text-mb-fg` : tw`text-mb-mute`,
                      { letterSpacing: 1.5 },
                    ]}
                  >
                    {a.id}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* About group */}
          <View style={tw`mt-8`}>
            <Overline>About</Overline>
          </View>
          <AboutRow label="Mid breath" value="v1.0" />
          <AboutRow label="No accounts" value="nothing is collected" />
          <AboutRow label="No streaks" value="nothing is counted at you" />
        </ScrollView>
      </View>
    </View>
  );
};
