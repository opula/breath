import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import tw from "../../utils/tw";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

const GESTURES = [
  { label: "Single tap", hint: "· start or advance to the next phase" },
  { label: "Double tap", hint: "· pause or resume the session" },
  { label: "Long press", hint: "· reset the session to the start" },
  { label: "Swipe up / down", hint: "· change the current exercise" },
];

const CONTROLS = [
  { label: "← library", hint: "· return to the exercise list" },
  { label: "pause · resume", hint: "· toggle the session (same as 2× tap)" },
  { label: "round · time", hint: "· round progress and elapsed timer" },
];

const FAQ = [
  {
    q: "Is this a meditation app?",
    a: "No. It schedules breath cycles. Meditation is something you do with it.",
  },
  {
    q: "Will it stop me from fainting?",
    a: "No. The app can’t see you. If a retention feels wrong, stop.",
  },
  {
    q: "Why are there no streaks?",
    a: "Because the app works whether or not you come back. Streaks optimize for the app, not for you.",
  },
  {
    q: "Can I build my own exercise?",
    a: "Yes — any sequence of phases with any durations. The ring respects whatever you define.",
  },
];

const Row = ({ label, hint }: { label: string; hint: string }) => (
  <View style={tw`flex-row items-center py-4 border-b border-mb-line`}>
    <View style={tw`flex-1`}>
      <Text
        style={[
          tw`font-display text-[16px] text-mb-fg uppercase`,
          { letterSpacing: -0.3 },
        ]}
      >
        {label}
      </Text>
    </View>
    <Text
      style={[
        tw`font-mono text-[9px] text-mb-mute uppercase max-w-[60%] text-right`,
        { letterSpacing: 1.8 },
      ]}
    >
      {hint}
    </Text>
  </View>
);

export const Help = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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
            · manual
          </Text>
          <View style={tw`w-10`} />
        </View>

        <ScrollView
          contentContainerStyle={tw`px-6 pb-10`}
          showsVerticalScrollIndicator={false}
        >
          <Overline accent right="rtfm">How it works</Overline>
          <View style={tw`mt-5 mb-5`}>
            <BigTitle size={36} accent>{`Everything\nis a gesture`}</BigTitle>
          </View>
          <Text
            style={tw`font-inter text-sm text-mb-mute leading-relaxed mb-6`}
          >
            Mid Breath hides its UI during practice so nothing competes with
            your attention. Everything is reachable without looking.
          </Text>

          <Overline>Gestures</Overline>
          {GESTURES.map((g) => (
            <Row key={g.label} label={g.label} hint={g.hint} />
          ))}

          <View style={tw`mt-8`}>
            <Overline>Session controls</Overline>
          </View>
          {CONTROLS.map((c) => (
            <Row key={c.label} label={c.label} hint={c.hint} />
          ))}

          <View style={tw`mt-8`}>
            <Overline>FAQ</Overline>
          </View>
          {FAQ.map((item) => (
            <View
              key={item.q}
              style={tw`py-4 border-b border-mb-line`}
            >
              <Text
                style={[
                  tw`font-display text-[15px] text-mb-fg uppercase mb-2`,
                  { letterSpacing: -0.3 },
                ]}
              >
                — {item.q}
              </Text>
              <Text
                style={tw`font-inter text-sm text-mb-mute leading-relaxed`}
              >
                {item.a}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
