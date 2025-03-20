import React, { useState } from "react";
import { TrayScreen } from "../../components/TrayScreen";
import { View, Text, TouchableOpacity, Switch, useWindowDimensions } from "react-native";
import TrackPlayer, {
  useActiveTrack,
  useIsPlaying,
} from "react-native-track-player";
import { Icon } from "../../components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MUSIC_BG_VOLUME, MUSIC_MIX_MODE, storage } from "../../utils/storage";
import AudioSession from "react-native-audio-session";
import { Slider, genSliderStyle2 } from "react-native-re-slider";
import {
  OrientationLocker,
  PORTRAIT,
} from "@hortau/react-native-orientation-locker";
import tw from "../../utils/tw";

const STARTING_MIX_MODE = storage.getBoolean(MUSIC_MIX_MODE) ?? false;

export const MusicControls = () => {
  const { width } = useWindowDimensions();
  const layoutWidth = Math.min(540, width);
  const track = useActiveTrack();
  const { playing, bufferingDuringPlay } = useIsPlaying();
  const { bottom } = useSafeAreaInsets();
  const [isBackgroundEnabled, setBackgroundEnabled] =
    useState(STARTING_MIX_MODE);
  const [volume, setVolume] = useState(storage.getNumber(MUSIC_BG_VOLUME) ?? 1);

  return (
    <>
      <TrayScreen trayHeight={280 + bottom}>
        <View style={tw`pt-6 px-2 flex-1`}>
          <Text style={tw`text-base text-center font-lusitana text-white`}>
            {track?.title ?? "-"}
          </Text>
          <View style={tw`mt-8 flex-row items-center`}>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity
                style={tw`active:opacity-80`}
                onPress={async () => {
                  const queue = await TrackPlayer.getQueue();
                  const activeIndex = await TrackPlayer.getActiveTrackIndex();

                  if (activeIndex === 0) {
                    TrackPlayer.skip(queue.length - 1);
                  } else {
                    TrackPlayer.skipToPrevious();
                  }
                }}
              >
                <Icon name="previous" color="white" size={32} />
              </TouchableOpacity>
            </View>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity 
                style={tw`active:opacity-80`}
                onPress={playing ? TrackPlayer.pause : TrackPlayer.play}
              >
                <Icon
                  name={playing ? "pause" : "play"}
                  color="white"
                  size={32}
                />
              </TouchableOpacity>
            </View>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity
                style={tw`active:opacity-80`}
                onPress={async () => {
                  const queue = await TrackPlayer.getQueue();
                  const activeIndex = await TrackPlayer.getActiveTrackIndex();

                  if (activeIndex && activeIndex + 1 === queue.length) {
                    TrackPlayer.skip(0);
                  } else {
                    TrackPlayer.skipToNext();
                  }
                }}
              >
                <Icon name="next" color="white" size={32} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={tw`flex-1`} />
          <View
            style={tw`mb-2 flex-row items-center justify-between`}
          >
            <View style={tw`flex-1 mr-6`}>
              <Text style={tw`text-base font-lusitana text-white`}>Background mode</Text>
              <Text style={tw`mt-1 text-sm font-lusitana text-red`}>
                Restart required in order for changes to take effect.
              </Text>
            </View>
            <Switch
              trackColor={{ false: "#d4d4d4", true: "#FFFFFF" }}
              thumbColor={"#000000"}
              ios_backgroundColor="#3e3e3e"
              onValueChange={async (value: boolean) => {
                // console.log(await AudioSession.currentCategoryOptions());
                try {
                  await AudioSession.setActive(false);
                  if (value) {
                    await AudioSession.setCategory("Playback", "MixWithOthers");
                  } else {
                    await AudioSession.setCategory("SoloAmbient");
                  }
                  await AudioSession.setActive(true);
                  storage.set(MUSIC_MIX_MODE, value);
                  setBackgroundEnabled(value);
                } catch (error) {
                  console.log(error);
                }
                // await TrackPlayer.reset();
                // await SetupAudioService(
                //   value ? MIX_IOS_CATEGORIES : DEFAULT_IOS_CATEGORIES,
                // );
                // await QueueInitialTracksService();
              }}
              value={isBackgroundEnabled}
            />
          </View>
          {STARTING_MIX_MODE && isBackgroundEnabled ? (
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
                  await TrackPlayer.setVolume(value);
                  storage.set(MUSIC_BG_VOLUME, value);
                }}
                step={0.01}
                maxValue={1}
                minValue={0}
                initialValue={Math.min(volume, 1)}
              />
            </View>
          ) : null}
          <View style={{ height: bottom }} />
        </View>
      </TrayScreen>
    </>
  );
};
