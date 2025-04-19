import React from "react";
import { TrayScreen } from "../../components/TrayScreen";
import { View, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { Icon } from "../../components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { storage } from "../../utils/storage";
import { Slider, genSliderStyle2 } from "react-native-re-slider";
import {
  OrientationLocker,
  PORTRAIT,
} from "@hortau/react-native-orientation-locker";
import tw from "../../utils/tw";

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
          <View style={tw`mt-2 mb-2`} key={`${layoutWidth}`}>
            <Slider
              {...genSliderStyle2({
                minTrackColor: "#e5e5e5",
                maxTrackColor: "#262626",
                thumbBorderColor: "#000000",
              })}
              width={layoutWidth - 54}
              onIndexChange={async (value) => {
                setVolume(value);
              }}
              step={0.01}
              maxValue={1}
              minValue={0}
              initialValue={volume}
            />
          </View>
          <View style={{ height: bottom }} />
        </View>
      </TrayScreen>
    </>
  );
};
