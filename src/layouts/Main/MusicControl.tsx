import React from 'react';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { Icon } from '../../components/Icon';
import { TouchableOpacity } from 'react-native';
import tw from '../../utils/tw';

export const MusicControl = () => {
  const { isPlaying, play, pause } = useAudioPlayer();

  return (
    <TouchableOpacity
      style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
      onPress={isPlaying ? pause : play}>
      <Icon
        name={isPlaying ? 'pause-circle' : 'play-circle'}
        size={24}
        color="white"
      />
    </TouchableOpacity>
  );
};
