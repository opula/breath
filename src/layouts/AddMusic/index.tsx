import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TrayScreen } from "../../components/TrayScreen";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import tw from "../../utils/tw";
import { Overline } from "../../components/Overline";

type Option = {
  key: string;
  label: string;
  hint: string;
  onPick: () => void;
};

export const AddMusic = () => {
  const navigation = useNavigation();
  const { bottom } = useSafeAreaInsets();
  const { pickLocalFile, pasteUrl, isDownloading } = useAudioPlayer();

  const options: Option[] = [
    {
      key: "wifi",
      label: "WiFi transfer",
      hint: "upload from any device on your network",
      onPick: () => {
        navigation.goBack();
        navigation.navigate("FileTransfer" as never);
      },
    },
    {
      key: "url",
      label: "Download from URL",
      hint: "paste a link from your clipboard",
      onPick: () => {
        navigation.goBack();
        pasteUrl();
      },
    },
    {
      key: "file",
      label: "Browse on device",
      hint: "pick an audio file from this phone",
      onPick: () => {
        navigation.goBack();
        pickLocalFile();
      },
    },
  ];

  return (
    <TrayScreen trayHeight={400 + bottom}>
      <View style={tw`pt-2 pb-2 px-2`}>
        <Overline accent right={`${options.length} paths`}>
          Add music
        </Overline>
      </View>

      <View style={tw`flex-1 px-2`}>
        {options.map((opt, i) => {
          const showLoader = opt.key === "url" && isDownloading;
          return (
            <Pressable
              key={opt.key}
              onPress={opt.onPick}
              disabled={showLoader}
              style={({ pressed }) => [
                tw`flex-row items-center py-4 border-b border-mb-line`,
                pressed && tw`opacity-70`,
              ]}
            >
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute uppercase w-8`,
                  { letterSpacing: 1.5 },
                ]}
              >
                {String(i + 1).padStart(2, "0")}
              </Text>
              <View style={tw`flex-1`}>
                <Text
                  style={[
                    tw`font-display text-[18px] text-mb-fg uppercase`,
                    { letterSpacing: -0.4 },
                  ]}
                >
                  {opt.label}
                </Text>
                <Text
                  style={[
                    tw`font-mono text-[9px] text-mb-mute uppercase mt-1`,
                    { letterSpacing: 1.8 },
                  ]}
                >
                  {opt.hint}
                </Text>
              </View>
              {showLoader ? (
                <ActivityIndicator size="small" color="#F2F2EF" />
              ) : (
                <Text style={[tw`font-mono text-[14px] text-mb-mute`]}>→</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </TrayScreen>
  );
};
