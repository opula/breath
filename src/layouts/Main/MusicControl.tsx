import React from 'react';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import {Icon} from '../../components/Icon';
import {TouchableOpacity} from 'react-native';
import tw from '../../utils/tw';

export const MusicControl = () => {
  const { isPlaying, play, pause, nextTrack } = useAudioPlayer();

  return (
    <>
      <TouchableOpacity
        style={tw`mt-2 h-10 w-10 items-center justify-center active:opacity-80`}
        onPress={isPlaying ? pause : play}>
        <Icon
          name={isPlaying ? 'pause-circle' : 'play-circle'}
          size={24}
          color="white"
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={tw`mt-2 h-10 w-10 items-center justify-center active:opacity-80`}
        onPress={nextTrack}>
        <Icon name={'next'} size={24} color="white" />
      </TouchableOpacity>
    </>
  );
};
