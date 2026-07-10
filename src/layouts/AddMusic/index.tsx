import React, { useRef } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { AppSheet, AppSheetHandle } from "../../components/AppSheet";
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
  const { pickLocalFile, pasteUrl, isDownloading } = useAudioPlayer();
  const sheetRef = useRef<AppSheetHandle>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  // Close the sheet first; the action runs after it settles and the route pops.
  const pick = (action: () => void) => {
    pendingAction.current = action;
    sheetRef.current?.dismiss();
  };

  const options: Option[] = [
    {
      key: "wifi",
      label: "WiFi transfer",
      hint: "upload from any device on your network",
      onPick: () => pick(() => navigation.navigate("FileTransfer" as never)),
    },
    {
      key: "url",
      label: "Download from URL",
      hint: "paste a link from your clipboard",
      onPick: () => pick(pasteUrl),
    },
    {
      key: "file",
      label: "Browse on device",
      hint: "pick an audio file from this phone",
      onPick: () => pick(pickLocalFile),
    },
  ];

  return (
    <AppSheet
      ref={sheetRef}
      onDismissed={() => {
        pendingAction.current?.();
        pendingAction.current = null;
      }}
    >
      <View style={tw`pt-2 pb-2 px-2`}>
        <Overline accent right={`${options.length} paths`}>
          Add music
        </Overline>
      </View>

      <View style={tw`px-2 pb-4`}>
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
                    tw`font-item text-[18px] text-mb-ink`,
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
    </AppSheet>
  );
};
