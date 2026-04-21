import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TrayScreen } from "../../components/TrayScreen";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { Icon } from "../../components/Icon";
import tw from "../../utils/tw";

export const AddMusic = () => {
  const navigation = useNavigation();
  const { bottom } = useSafeAreaInsets();
  const { pickLocalFile, pasteUrl, isDownloading } = useAudioPlayer();

  return (
    <TrayScreen trayHeight={300 + bottom}>
      {/* <View style={tw`pt-6 px-2 mb-6 items-center`}>
        <Text style={tw`text-base font-inter text-white`}>Add music</Text>
      </View> */}

      <View style={[tw`flex-1`, { marginBottom: bottom }]}>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "flex-row px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => {
            navigation.goBack();
            navigation.navigate("FileTransfer" as never);
          }}
        >
          <View style={tw`mt-1`}>
            <Icon name="wifi" size={18} color="white" />
          </View>
          <View style={tw`ml-4 flex-1`}>
            <Text style={tw`text-lg font-inter text-neutral-200`}>
              Transfer with WiFi
            </Text>
            <Text style={tw`text-xs font-inter text-neutral-500 mt-1`}>
              Creates a temporary web page to upload files from any device on
              your local network
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) =>
            tw.style(
              "flex-row px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => {
            navigation.goBack();
            pasteUrl();
          }}
          disabled={isDownloading}
        >
          <View style={tw`mt-1`}>
            {isDownloading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Icon name="download" size={18} color="white" />
            )}
          </View>
          <View style={tw`ml-4 flex-1`}>
            <Text style={tw`text-lg font-inter text-neutral-200`}>
              Download audio from URL
            </Text>
            <Text style={tw`text-xs font-inter text-neutral-500 mt-1`}>
              Paste a link from your clipboard
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) =>
            tw.style("flex-row px-6 py-4", pressed && "opacity-80")
          }
          onPress={() => {
            navigation.goBack();
            pickLocalFile();
          }}
        >
          <View style={tw`mt-1`}>
            <Icon name="folder" size={18} color="white" />
          </View>
          <View style={tw`ml-4 flex-1`}>
            <Text style={tw`text-lg font-inter text-neutral-200`}>
              Browse files on device
            </Text>
            <Text style={tw`text-xs font-inter text-neutral-500 mt-1`}>
              Pick an audio file from this device
            </Text>
          </View>
        </Pressable>
      </View>
    </TrayScreen>
  );
};
