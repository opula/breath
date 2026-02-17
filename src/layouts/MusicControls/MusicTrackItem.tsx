import React from 'react';
import {Text, Pressable, View} from 'react-native';
import {Icon} from '../../components/Icon';
import tw from '../../utils/tw';
import {MusicFile} from '../../types/music';

const formatTrackName = (filename: string) =>
  filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

interface MusicTrackItemProps {
  item: MusicFile;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
}

export const MusicTrackItem = ({
  item,
  isActive,
  isPlaying,
  onPress,
}: MusicTrackItemProps) => {
  return (
    <Pressable
      style={tw`flex-row items-center px-4 py-3 active:opacity-80`}
      onPress={onPress}>
      <View style={tw`w-6 items-center`}>
        {isActive && (
          <Icon
            name={isPlaying ? 'pause' : 'play'}
            color="#6FE7FF"
            size={14}
          />
        )}
      </View>
      <Text
        style={[
          tw`flex-1 ml-2 text-sm font-inter ${
            isActive ? 'text-white' : 'text-neutral-400'
          }`,
          isActive && {color: '#6FE7FF'},
        ]}
        numberOfLines={1}>
        {formatTrackName(item.name)}
      </Text>
    </Pressable>
  );
};
