import React from 'react';
import TrackPlayer, {
  useIsPlaying,
  useActiveTrack,
} from 'react-native-track-player';
import {Icon} from '../../components/Icon';
import {TouchableOpacity} from 'react-native';
import tw from '../../utils/tw';

export const MusicControl = () => {
  const {playing, bufferingDuringPlay} = useIsPlaying();

  return (
    <>
      <TouchableOpacity
        style={tw`mt-2 h-10 w-10 items-center justify-center active:opacity-80`}
        onPress={playing ? TrackPlayer.pause : TrackPlayer.play}>
        <Icon
          name={playing ? 'pause-circle' : 'play-circle'}
          size={24}
          color="white"
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={tw`mt-2 h-10 w-10 items-center justify-center active:opacity-80`}
        onPress={async () => {
          const queue = await TrackPlayer.getQueue();
          const activeIndex = await TrackPlayer.getActiveTrackIndex();

          if (activeIndex && activeIndex + 1 === queue.length) {
            TrackPlayer.skip(0);
          } else {
            TrackPlayer.skipToNext();
          }
        }}>
        <Icon name={'next'} size={24} color="white" />
      </TouchableOpacity>
    </>
  );
};
