import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import tw from "../../utils/tw";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";
import { NavHeader } from "../../components/NavHeader";

const GESTURES = [
  { label: "Single tap", hint: "advance when no timer is shown" },
  { label: "Double tap", hint: "pause or resume" },
  { label: "Long press", hint: "restart the exercise" },
  { label: "← library", hint: "exit" },
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

const Section = ({
  label,
  body,
}: {
  label: string;
  body: string;
}) => (
  <View style={tw`mt-8`}>
    <Overline>{label}</Overline>
    <Text
      style={tw`font-inter text-sm text-mb-mute leading-relaxed mt-4`}
    >
      {body}
    </Text>
  </View>
);

const Principle = ({
  label,
  body,
}: {
  label: string;
  body: string;
}) => (
  <View style={tw`mt-6`}>
    <Text
      style={[
        tw`font-display text-[15px] text-mb-fg uppercase mb-2`,
        { letterSpacing: -0.3 },
      ]}
    >
      — {label}
    </Text>
    <Text style={tw`font-inter text-sm text-mb-mute leading-relaxed`}>
      {body}
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
        <NavHeader title="manual" onClose={() => navigation.goBack()} />

        <ScrollView
          contentContainerStyle={tw`px-6 pb-10`}
          showsVerticalScrollIndicator={false}
        >
          <Overline accent right="rtfm">About</Overline>
          <View style={tw`mt-5 mb-5`}>
            <BigTitle size={36} accent>{`Breath,\ndeliberate.`}</BigTitle>
          </View>
          <Text
            style={tw`font-inter text-sm text-mb-mute leading-relaxed mb-2`}
          >
            How you breathe changes how you feel. Slow it down to
            settle. Speed it up to rise. Hold it to step outside the
            ordinary. Mid Breath is an instrument for running those
            patterns: pick one from the library, or build your own.
          </Text>

          <Section
            label="Patterns"
            body="Long exhales quiet the nervous system and slow the heart. Long inhales wake it up. Equal phases, the box, steady the mind. Cycles of fast breaths followed by holds reach for altered states. The library covers a spread: box, tummo, holotropic, retention, and more. Each is a fixed sequence of phases, in rounds you can set."
          />

          <Section
            label="Build"
            body="Compose your own. A phase is a single instruction: inhale four, hold seven, exhale eight. An exercise is any sequence of them, with text cues, pauses, or repeats where you want them. Leave a phase open-ended to move past it on your own tap. Saved exercises join the library."
          />

          <Section
            label="Immersion"
            body="A session is designed to keep your eyes off the clock. The ring in the middle grows on inhale and shrinks on exhale. Follow it and you can stop counting. Scenes put a moving backdrop behind the ring, or nothing. Bring your own music from another device on the same WiFi (Music › Add music). Phase cues and haptics are toggles in Settings."
          />

          <View style={tw`mt-10`}>
            <Overline>Principles</Overline>
          </View>

          <View style={tw`mt-5`}>
            <Text
              style={[
                tw`font-display text-[15px] text-mb-fg uppercase mb-2`,
                { letterSpacing: -0.3 },
              ]}
            >
              — Privacy
            </Text>
            <Text
              style={tw`font-inter text-sm text-mb-mute leading-relaxed`}
            >
              No accounts, no sync, no analytics. Everything you make
              or play stays on your device.
            </Text>
          </View>

          <Principle
            label="Progress"
            body="There isn't any. No streaks, no totals, no calendar. Come back when you want to."
          />

          <Principle
            label="Safety"
            body="Retention and fast breathing can make you light-headed. Sit or lie down. Never in water or while driving. If a session feels wrong, stop. The app can't see you."
          />

          <View style={tw`mt-10`}>
            <Overline>During a session</Overline>
          </View>
          {GESTURES.map((g) => (
            <Row key={g.label} label={g.label} hint={g.hint} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
