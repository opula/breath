import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { musicFilesSelector } from "../../state/musicLibrary.selectors";
import tw from "../../utils/tw";
import { NavHeader } from "../../components/NavHeader";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

const SAMPLE_TRACKS = [
  {
    name: "Early Morning Stillness",
    url: "https://cdn.midnightsatori.com/Early%20Morning%20Stillness.mp3",
  },
  {
    name: "Reflecting on a Good Day",
    url: "https://cdn.midnightsatori.com/Reflecting%20on%20a%20Good%20Day.mp3",
  },
];

const ADDING = [
  { label: "WiFi transfer", hint: "upload via browser on a nearby device" },
  { label: "Download from URL", hint: "download an audio link from your clipboard" },
  { label: "Browse on device", hint: "choose an audio file from this phone" },
];

const PLAYBACK = [
  { label: "Tap a track", hint: "starts playback in the background" },
  { label: "Volume dial", hint: "set the level on the Music screen" },
  { label: "Swipe left", hint: "reveal delete on a track" },
];

const TIPS = [
  "Music plays alongside exercise sounds and continues between sessions.",
  "MP3, M4A, WAV and other common audio types are supported.",
  "Tracks are saved locally and work offline after downloading.",
];

const Row = ({ label, hint }: { label: string; hint: string }) => (
  <View
    style={tw`flex-row items-center py-4 border-b border-mb-line`}
  >
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
        tw`font-mono text-[9px] text-mb-mute uppercase max-w-[55%] text-right`,
        { letterSpacing: 1.8 },
      ]}
    >
      {hint}
    </Text>
  </View>
);

export const MusicHelp = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { downloadUrl, isDownloading } = useAudioPlayer();
  const files = useSelector(musicFilesSelector);

  const hasTrack = useCallback(
    (name: string) => files.some((f) => f.name === `${name}.mp3`),
    [files],
  );

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top nav */}
        <NavHeader title="music manual" onClose={() => navigation.goBack()} />

        <ScrollView
          contentContainerStyle={tw`px-6 pb-10`}
          showsVerticalScrollIndicator={false}
        >
          <Overline accent>Music</Overline>
          <View style={tw`mt-5 mb-5`}>
            <BigTitle size={40} accent>{`Bring\nyour own`}</BigTitle>
          </View>
          <Text
            style={tw`font-inter text-sm text-mb-mute leading-relaxed mb-6`}
          >
            Add tracks to play during breathing exercises. Music sits
            underneath the exercise sounds and continues between sessions.
          </Text>

          <Overline>Adding music</Overline>
          {ADDING.map((r) => (
            <Row key={r.label} label={r.label} hint={r.hint} />
          ))}

          <View style={tw`mt-8`}>
            <Overline right="free to add">Sample tracks</Overline>
          </View>
          {SAMPLE_TRACKS.map((track) => {
            const alreadyAdded = hasTrack(track.name);
            return (
              <View
                key={track.name}
                style={tw`flex-row items-center py-4 border-b border-mb-line`}
              >
                <Text
                  style={[
                    tw`font-display text-[16px] text-mb-fg uppercase flex-1`,
                    { letterSpacing: -0.3 },
                  ]}
                  numberOfLines={1}
                >
                  {track.name}
                </Text>
                {alreadyAdded ? (
                  <Text
                    style={[
                      tw`font-mono text-[10px] text-mb-mute uppercase`,
                      { letterSpacing: 2 },
                    ]}
                  >
                    added
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => downloadUrl(track.url)}
                    disabled={isDownloading}
                    style={({ pressed }) => [
                      tw`px-3 py-1 border border-mb-accent`,
                      pressed && tw`opacity-70`,
                    ]}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="#6FE7FF" />
                    ) : (
                      <Text
                        style={[
                          tw`font-mono text-[10px] text-mb-accent uppercase`,
                          { letterSpacing: 2 },
                        ]}
                      >
                        add
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}

          <View style={tw`mt-8`}>
            <Overline>Playback</Overline>
          </View>
          {PLAYBACK.map((r) => (
            <Row key={r.label} label={r.label} hint={r.hint} />
          ))}

          <View style={tw`mt-8`}>
            <Overline>Tips</Overline>
          </View>
          {TIPS.map((tip, i) => (
            <View key={i} style={tw`flex-row py-3 border-b border-mb-line`}>
              <Text
                style={[
                  tw`font-mono text-[9px] text-mb-mute uppercase w-8 pt-[2px]`,
                  { letterSpacing: 1.5 },
                ]}
              >
                {String(i + 1).padStart(2, "0")}
              </Text>
              <Text
                style={tw`font-inter text-sm text-mb-mute leading-relaxed flex-1`}
              >
                {tip}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
