import React from "react";
import { Text, Pressable, View } from "react-native";
import tw from "../../utils/tw";
import { MusicFile } from "../../types/music";

const formatTrackName = (filename: string) =>
  filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

interface MusicTrackItemProps {
  item: MusicFile;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
}

export const MusicTrackItem = ({
  item,
  index,
  isActive,
  isPlaying,
  onPress,
}: MusicTrackItemProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tw`flex-row items-center py-4 border-b border-mb-line`,
        pressed && tw`opacity-70`,
      ]}
    >
      <Text
        style={[
          tw`font-mono text-[10px] uppercase w-8`,
          isActive ? tw`text-mb-accent` : tw`text-mb-mute`,
          { letterSpacing: 1.5 },
        ]}
      >
        {String(index + 1).padStart(2, "0")}
      </Text>
      <Text
        style={[
          tw`font-item text-[18px] flex-1`,
          isActive ? tw`text-mb-accent` : tw`text-mb-ink`,
        ]}
        numberOfLines={1}
      >
        {formatTrackName(item.name)}
      </Text>
      <Text
        style={[
          tw`font-mono text-[10px] uppercase ml-3`,
          isActive ? tw`text-mb-accent` : tw`text-mb-mute`,
          { letterSpacing: 2 },
        ]}
      >
        {isActive ? (isPlaying ? "▶ playing" : "paused") : "play"}
      </Text>
    </Pressable>
  );
};
