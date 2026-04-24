import React, { useCallback } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { useSelector } from "react-redux";
import {
  musicFilesSelector,
  activeFileIdSelector,
} from "../../state/musicLibrary.selectors";
import { HorizontalDial } from "../../components/HorizontalDial";
import tw from "../../utils/tw";
import SwipeableItem from "react-native-swipeable-item";
import { SwipeRightRemove } from "../../components/UnderlyingSwipe/SwipeRightRemove";
import { MusicTrackItem } from "./MusicTrackItem";
import { MusicFile } from "../../types/music";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

export const MusicControls = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isPlaying, volume, setVolume, playFile, deleteFile } =
    useAudioPlayer();

  const files = useSelector(musicFilesSelector);
  const activeFileId = useSelector(activeFileIdSelector);

  const onVolumeChange = useCallback(
    (value: number) => {
      setVolume(value / 100);
    },
    [setVolume],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MusicFile; index: number }) => (
      <SwipeableItem
        item={item}
        snapPointsLeft={[120]}
        renderUnderlayLeft={() => (
          <SwipeRightRemove
            drag={() => {}}
            onPressDelete={() => deleteFile(item.id)}
          />
        )}
      >
        <View style={tw`bg-mb-bg`}>
          <MusicTrackItem
            item={item}
            index={index}
            isActive={item.id === activeFileId}
            isPlaying={item.id === activeFileId && isPlaying}
            onPress={() => playFile(item.id)}
          />
        </View>
      </SwipeableItem>
    ),
    [activeFileId, isPlaying, playFile, deleteFile],
  );

  const keyExtractor = useCallback((item: MusicFile) => item.id, []);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top nav */}
        <View style={tw`flex-row items-center justify-between px-6 py-3`}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={tw`py-2 active:opacity-60`}
          >
            <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px]`,
                { letterSpacing: 3 },
              ]}
            >
              ← back
            </Text>
          </Pressable>
          <Text
            style={[
              tw`font-mono text-mb-mute uppercase text-[10px] py-2`,
              { letterSpacing: 3 },
            ]}
          >
            sound
          </Text>
          <Pressable
            onPress={() => navigation.navigate("MusicHelp" as never)}
            style={tw`py-2 active:opacity-60`}
          >
            <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px]`,
                { letterSpacing: 3 },
              ]}
            >
              help
            </Text>
          </Pressable>
        </View>

        {/* Hero + volume */}
        <View style={tw`px-6 pt-2 pb-5`}>
          <Overline accent right="external · looped">
            Background
          </Overline>
          <View style={tw`mt-5`}>
            <BigTitle size={44} accent>{`Music\nor silence`}</BigTitle>
          </View>

          {/* Volume */}
          <View style={tw`mt-6`}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text
                style={[
                  tw`font-mono text-[9px] text-mb-mute uppercase`,
                  { letterSpacing: 2 },
                ]}
              >
                volume
              </Text>
              {/* <Text
                style={[
                  tw`font-mono text-[10px] text-mb-fg`,
                  { letterSpacing: 2, fontVariant: ["tabular-nums"] },
                ]}
              >
                {String(Math.round(volume * 100)).padStart(3, "0")} / 100
              </Text> */}
            </View>
            <View style={tw`mt-2`}>
              <HorizontalDial
                min={0}
                max={100}
                step={1}
                suffix="%"
                defaultValue={Math.round(volume * 100)}
                onChange={onVolumeChange}
              />
            </View>
          </View>
        </View>

        {/* Library list */}
        <View style={tw`flex-1 px-6`}>
          <Overline right={`${files.length} tracks`}>Library</Overline>

          <FlatList
            data={files}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={tw`py-6`}>
                <Text
                  style={[
                    tw`font-mono text-[10px] text-mb-mute uppercase`,
                    { letterSpacing: 2 },
                  ]}
                >
                  no tracks yet — add one above
                </Text>
              </View>
            }
            ListFooterComponent={
              <Pressable
                onPress={() => navigation.navigate("AddMusic" as never)}
                style={({ pressed }) => [
                  tw`flex-row items-center py-4 border-b border-mb-line`,
                  pressed && tw`opacity-70`,
                ]}
              >
                <Text
                  style={[
                    tw`font-mono text-mb-accent uppercase text-[10px] w-8`,
                    { letterSpacing: 1.5 },
                  ]}
                >
                  +
                </Text>
                <Text
                  style={[
                    tw`font-display text-mb-fg uppercase text-[18px] flex-1`,
                    { letterSpacing: -0.4 },
                  ]}
                >
                  Add music
                </Text>
                <Text
                  style={[
                    tw`font-mono text-mb-mute uppercase text-[10px]`,
                    { letterSpacing: 2 },
                  ]}
                >
                  wifi · url · file
                </Text>
              </Pressable>
            }
          />
        </View>
      </View>
    </View>
  );
};
