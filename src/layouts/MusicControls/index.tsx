import React, { useCallback, useState, useEffect } from "react";
import { TrayScreen } from "../../components/TrayScreen";
import {
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { Icon } from "../../components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { storage } from "../../utils/storage";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import {
  OrientationLocker,
  PORTRAIT,
} from "@hortau/react-native-orientation-locker";
import tw from "../../utils/tw";
import Decimal from "decimal.js";

export const MusicControls = () => {
  const { width } = useWindowDimensions();
  const layoutWidth = Math.min(540, width);
  const {
    currentTrack,
    isPlaying,
    play,
    pause,
    nextTrack,
    previousTrack,
    volume,
    setVolume,
  } = useAudioPlayer();

  // Create shared values for the slider
  const progress = useSharedValue(
    Decimal(volume).toDecimalPlaces(2).toNumber()
  );
  const min = useSharedValue(0);
  const max = useSharedValue(1);
  console.log(progress.value);

  // Keep shared value in sync with volume from context
  useEffect(() => {
    progress.value = volume;
  }, [volume, progress]);

  const { bottom } = useSafeAreaInsets();

  return (
    <>
      <TrayScreen trayHeight={220 + bottom}>
        <View style={tw`pt-6 px-2 flex-1`}>
          <Text style={tw`text-base text-center font-lusitana text-white`}>
            {currentTrack?.title ?? "-"}
          </Text>
          <View style={tw`mt-8 flex-row items-center`}>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity
                style={tw`active:opacity-80`}
                onPress={previousTrack}
              >
                <Icon name="previous" color="white" size={32} />
              </TouchableOpacity>
            </View>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity
                style={tw`active:opacity-80`}
                onPress={isPlaying ? pause : play}
              >
                <Icon
                  name={isPlaying ? "pause" : "play"}
                  color="white"
                  size={32}
                />
              </TouchableOpacity>
            </View>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity
                style={tw`active:opacity-80`}
                onPress={nextTrack}
              >
                <Icon name="next" color="white" size={32} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={tw`flex-1`} />
          <View
            style={tw`mt-2 mb-2 items-center justify-center`}
            key={`${layoutWidth}`}
          >
            <Slider
              style={{ width: layoutWidth - 96 }}
              progress={progress}
              minimumValue={min}
              maximumValue={max}
              onSlidingComplete={useCallback(
                (value: number) => {
                  // Update volume when sliding completes
                  setVolume(Decimal(value).toDecimalPlaces(2).toNumber());
                },
                [setVolume]
              )}
              // Customize the slider appearance
              theme={{
                minimumTrackTintColor: "#e5e5e5",
                maximumTrackTintColor: "#262626",
                bubbleBackgroundColor: "#000000",
              }}
              // Smooth step size
              // steps={0.1}
              // Disable cache track for smoother appearance
              disableTrackFollow
            />
          </View>
          <View style={{ height: bottom }} />
        </View>
      </TrayScreen>
    </>
  );
};
