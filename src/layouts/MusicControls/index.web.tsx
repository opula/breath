import React, {useState} from 'react';
import {TrayScreen} from '../../components/TrayScreen';
import {View, Text, TouchableOpacity} from 'react-native';
import tw from '../../utils/tw';
import TrackPlayer, {
  useActiveTrack,
  useIsPlaying,
} from '@5stones/react-native-track-player';
import {Icon} from '../../components/Icon';
import {useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {MUSIC_BG_VOLUME, MUSIC_MIX_MODE, storage} from '../../utils/storage';

const STARTING_MIX_MODE = storage.getBoolean(MUSIC_MIX_MODE) ?? false;

export const MusicControls = () => {
  const {width} = useWindowDimensions();
  const layoutWidth = Math.min(540, width);
  const track = useActiveTrack();
  const {playing, bufferingDuringPlay} = useIsPlaying();
  const {bottom} = useSafeAreaInsets();
  const [isBackgroundEnabled, setBackgroundEnabled] =
    useState(STARTING_MIX_MODE);
  const [volume, setVolume] = useState(storage.getNumber(MUSIC_BG_VOLUME) ?? 1);

  return (
    <>
      <TrayScreen trayHeight={280 + bottom}>
        <View style={tw`pt-6 px-2 flex-1`}>
          <Text style={tw`text-xl font-lusitana text-white text-center`}>
            {track?.title ?? '-'}
          </Text>
          <View style={tw`mt-8 flex-row items-center`}>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity
                style={tw`p-2 active:opacity-80`}
                onPress={async () => {
                  const queue = await TrackPlayer.getQueue();
                  const activeIndex = await TrackPlayer.getActiveTrackIndex();

                  if (activeIndex === 0) {
                    TrackPlayer.skip(queue.length - 1);
                  } else {
                    TrackPlayer.skipToPrevious();
                  }
                }}>
                <Icon name="previous" color="white" size={32} />
              </TouchableOpacity>
            </View>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity 
                style={tw`p-2 active:opacity-80`}
                onPress={playing ? TrackPlayer.pause : TrackPlayer.play}>
                <Icon
                  name={playing ? 'pause' : 'play'}
                  color="white"
                  size={32}
                />
              </TouchableOpacity>
            </View>
            <View style={tw`flex-1 items-center justify-center`}>
              <TouchableOpacity
                style={tw`p-2 active:opacity-80`}
                onPress={async () => {
                  const queue = await TrackPlayer.getQueue();
                  const activeIndex = await TrackPlayer.getActiveTrackIndex();

                  if (activeIndex && activeIndex + 1 === queue.length) {
                    TrackPlayer.skip(0);
                  } else {
                    TrackPlayer.skipToNext();
                  }
                }}>
                <Icon name="next" color="white" size={32} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={tw`flex-1`} />
          <View style={{height: bottom}} />
        </View>
      </TrayScreen>
    </>
  );
};
