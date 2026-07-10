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
  hideCenterHintsSelector,
  timerProgressModeSelector,
} from "../../state/configuration.selectors";
import {
  toggleGrayscale,
  toggleSounds,
  toggleHaptics,
  toggleHideCenterHints,
  setTimerProgressMode,
  type TimerProgressMode,
} from "../../state/configuration.reducer";
// Accent picker is parked — see note below the Display group.
// import { accentColorSelector } from "../../state/accent.selectors";
// import { setAccentColor } from "../../state/accent.reducer";
import { MainStackParams } from "../../navigation";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";
import { NavHeader } from "../../components/NavHeader";
import Constants from "expo-constants";

// const ACCENTS = [
//   { id: "mint", hex: "#6FE7FF" },
//   { id: "amber", hex: "#FFB545" },
//   { id: "rose", hex: "#FF8FA3" },
//   { id: "lime", hex: "#C8F26D" },
//   { id: "paper", hex: "#EDEDEA" },
// ];

const TIMER_PROGRESS_OPTIONS: {
  mode: TimerProgressMode;
  label: string;
  hint: string;
}[] = [
  {
    mode: "always",
    label: "Always on",
    hint: "show during timed sessions",
  },
  {
    mode: "minuteFade",
    label: "Minute pulse",
    hint: "fade at each minute",
  },
  {
    mode: "endOn",
    label: "End on",
    hint: "show after target time",
  },
  {
    mode: "endFade",
    label: "End pulse",
    hint: "fade after target time",
  },
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

const OptionRow = ({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
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
          tw`font-display text-[18px] uppercase`,
          selected ? tw`text-mb-accent` : tw`text-mb-fg`,
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
    <Text
      style={[
        tw`font-mono text-[12px] uppercase`,
        selected ? tw`text-mb-accent` : tw`text-mb-dim`,
        { letterSpacing: 1.5 },
      ]}
    >
      {selected ? "ON" : "--"}
    </Text>
  </Pressable>
);

export const Settings = () => {
  const navigation = useNavigation<NavigationProp<MainStackParams>>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const soundsEnabled = useAppSelector(soundsEnabledSelector);
  const hapticsEnabled = useAppSelector(hapticsEnabledSelector);
  const hideCenterHints = useAppSelector(hideCenterHintsSelector);
  const timerProgressMode = useAppSelector(timerProgressModeSelector);
  // const accentColor = useAppSelector(accentColorSelector);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top nav */}
        <NavHeader title="settings" onClose={() => navigation.goBack()} />

        <ScrollView
          contentContainerStyle={tw`px-6 pb-10`}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={tw`mt-2 mb-6`}>
            <Overline accent>Preferences</Overline>
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
          <ToggleRow
            label="Hide hints"
            hint="skip the center tap / hold prompts"
            enabled={hideCenterHints}
            onPress={() => dispatch(toggleHideCenterHints())}
          />

          <View style={tw`mt-8`}>
            <Overline>Timer bar</Overline>
          </View>
          {TIMER_PROGRESS_OPTIONS.map((option) => (
            <OptionRow
              key={option.mode}
              label={option.label}
              hint={option.hint}
              selected={timerProgressMode === option.mode}
              onPress={() => dispatch(setTimerProgressMode(option.mode))}
            />
          ))}

          {/* Accent picker — hidden until runtime palette swap is wired.
              `mb-accent` resolves via twrnc at compile time, so selecting a new
              hex persists to Redux but doesn't actually repaint the app. Re-enable
              once accent is threaded through a hook + inline styles at every call
              site (~34 tw usages + 9 raw hex refs, see notes). */}
          {/* <View style={tw`mt-8`}>
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
          </View> */}

          {/* About group */}
          <View style={tw`mt-8`}>
            <Overline>About</Overline>
          </View>
          <AboutRow
            label="Version"
            value={`v${Constants.expoConfig?.version ?? "1.0"}`}
          />
          {/* <AboutRow label="No accounts" value="nothing is collected" />
          <AboutRow label="No streaks" value="nothing is counted at you" /> */}
          <Pressable
            onPress={() => navigation.navigate("Help")}
            style={({ pressed }) => [
              tw`flex-row items-center py-3 border-b border-mb-line`,
              pressed && tw`opacity-70`,
            ]}
          >
            <Text
              style={[
                tw`font-display text-[15px] text-mb-fg uppercase flex-1`,
                { letterSpacing: -0.3 },
              ]}
            >
              Help
            </Text>
            <Text
              style={[
                tw`font-mono text-[10px] text-mb-mute uppercase`,
                { letterSpacing: 2 },
              ]}
            >
              guide · tips
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
};
