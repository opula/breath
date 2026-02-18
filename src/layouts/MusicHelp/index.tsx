import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { musicFilesSelector } from "../../state/musicLibrary.selectors";
import { Icon } from "../../components/Icon";
import tw from "../../utils/tw";

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

const ADDING_MUSIC = [
  {
    method: "Paste URL",
    description:
      "Copy a link to an audio file, then tap Paste URL. The file will be downloaded and added to your library.",
  },
  {
    method: "Pick File",
    description:
      "Choose an audio file from your device storage to add to your library.",
  },
];

const PLAYBACK = [
  { action: "Play a track", description: "Tap any track in your library" },
  {
    action: "Adjust volume",
    description: "Use the dial at the bottom to set playback volume",
  },
  {
    action: "Remove a track",
    description: "Swipe a track to the left to reveal the delete button",
  },
];

const TIPS = [
  "Music plays alongside exercise sounds and continues between exercises.",
  "Supported formats include MP3, M4A, WAV, and other common audio types.",
  "Tracks are saved locally so they work offline after downloading.",
];

export const MusicHelp = () => {
  const navigation = useNavigation();
  const { downloadUrl, isDownloading } = useAudioPlayer();
  const files = useSelector(musicFilesSelector);

  const hasTrack = useCallback(
    (name: string) => files.some((f) => f.name === `${name}.mp3`),
    [files],
  );

  return (
    <View style={tw`flex-1 bg-black`}>
      <SafeAreaView style={tw`flex-1`}>
        <View
          style={tw`flex-row px-4 pb-2 justify-between items-center border-b border-neutral-800`}
        >
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={20} color="white" />
          </Pressable>
          <Text style={tw`text-sm font-inter font-medium text-neutral-200`}>
            Music Help
          </Text>
          <View style={tw`h-10 w-10`} />
        </View>

        <ScrollView
          style={tw`flex-1 px-6 pt-6`}
          showsVerticalScrollIndicator={false}
        >
          <Text style={tw`text-base font-inter text-neutral-400 mb-8`}>
            Add your own music to play during breathing exercises. Tracks play
            in the background alongside exercise sounds.
          </Text>

          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 mb-4`}
          >
            Adding Music
          </Text>
          {ADDING_MUSIC.map((item) => (
            <View key={item.method} style={tw`flex-row py-3`}>
              <Text style={tw`text-sm font-inter text-neutral-200 w-36`}>
                {item.method}
              </Text>
              <Text style={tw`text-sm font-inter text-neutral-400 flex-1`}>
                {item.description}
              </Text>
            </View>
          ))}

          {/* Sample tracks */}
          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 mt-8 mb-2`}
          >
            Sample Tracks
          </Text>
          <Text style={tw`text-sm font-inter text-neutral-400 mb-4`}>
            Try these free tracks to get started.
          </Text>
          {SAMPLE_TRACKS.map((track) => {
            const alreadyAdded = hasTrack(track.name);
            return (
              <View
                key={track.name}
                style={tw`flex-row items-center py-3 justify-between`}
              >
                <Text
                  style={tw`text-sm font-inter text-neutral-200 flex-1 mr-4`}
                  numberOfLines={1}
                >
                  {track.name}
                </Text>
                {alreadyAdded ? (
                  <Text style={tw`text-xs font-inter text-neutral-600`}>
                    Added
                  </Text>
                ) : (
                  <Pressable
                    style={tw`flex-row items-center justify-center w-18 h-8 rounded-full border border-neutral-600 active:opacity-80`}
                    onPress={() => downloadUrl(track.url)}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Icon name="download" size={14} color="white" />
                        <Text style={tw`ml-2 text-xs font-inter text-white`}>
                          Add
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}

          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 mt-8 mb-4`}
          >
            Playback
          </Text>
          {PLAYBACK.map((item) => (
            <View key={item.action} style={tw`flex-row py-3`}>
              <Text style={tw`text-sm font-inter text-neutral-200 w-36`}>
                {item.action}
              </Text>
              <Text style={tw`text-sm font-inter text-neutral-400 flex-1`}>
                {item.description}
              </Text>
            </View>
          ))}

          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 mt-8 mb-4`}
          >
            Tips
          </Text>
          {TIPS.map((tip, i) => (
            <View key={i} style={tw`flex-row py-2`}>
              <Text style={tw`text-sm font-inter text-neutral-400`}>
                {"\u2022  "}
                {tip}
              </Text>
            </View>
          ))}

          <View style={tw`h-8`} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};
