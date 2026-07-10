import React, { useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { useSelector } from "react-redux";
import {
  musicFilesSelector,
  activeFileIdSelector,
  sortedMusicFilesSelector,
} from "../../state/musicLibrary.selectors";
import { HorizontalDial } from "../../components/HorizontalDial";
import tw from "../../utils/tw";
import SwipeableItem from "react-native-swipeable-item";
import { SwipeRightRemove } from "../../components/UnderlyingSwipe/SwipeRightRemove";
import { MusicTrackItem } from "./MusicTrackItem";
import { MusicFile } from "../../types/music";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";
import { NavHeader } from "../../components/NavHeader";

export const MusicControls = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isPlaying, volume, setVolume, playFile, deleteFile } =
    useAudioPlayer();

  const files = useSelector(sortedMusicFilesSelector);
  const activeFileId = useSelector(activeFileIdSelector);

  const listRef = useRef<FlatList<MusicFile>>(null);
  const filesRef = useRef(files);
  const activeFileIdRef = useRef(activeFileId);
  filesRef.current = files;
  activeFileIdRef.current = activeFileId;

  // After mount, animate the list down to the active track if it isn't already
  // near the top. Runs once per modal open (the modal remounts on each show).
  useEffect(() => {
    const id = activeFileIdRef.current;
    if (!id) return;
    const idx = filesRef.current.findIndex((f) => f.id === id);
    if (idx < 2) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.3,
      });
    }, 350);
    return () => clearTimeout(t);
  }, []);

  const onScrollToIndexFailed = useCallback(
    ({
      index,
      averageItemLength,
    }: {
      index: number;
      averageItemLength: number;
    }) => {
      setTimeout(() => {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * averageItemLength - 100),
          animated: true,
        });
      }, 100);
    },
    [],
  );

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
        <NavHeader title="music" onClose={() => navigation.goBack()} />

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
            ref={listRef}
            data={files}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            onScrollToIndexFailed={onScrollToIndexFailed}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={tw`py-6`}>
                <Text
                  style={[
                    tw`font-mono text-[10px] text-mb-mute uppercase`,
                    { letterSpacing: 2 },
                  ]}
                >
                  no tracks yet · add one below
                </Text>
              </View>
            }
            ListFooterComponent={
              <>
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
                <Pressable
                  onPress={() => navigation.navigate("MusicHelp" as never)}
                  style={({ pressed }) => [
                    tw`flex-row items-center py-4 border-b border-mb-line`,
                    pressed && tw`opacity-70`,
                  ]}
                >
                  <Text
                    style={[
                      tw`font-mono text-mb-mute uppercase text-[10px] w-8`,
                      { letterSpacing: 1.5 },
                    ]}
                  >
                    ?
                  </Text>
                  <Text
                    style={[
                      tw`font-display text-mb-fg uppercase text-[18px] flex-1`,
                      { letterSpacing: -0.4 },
                    ]}
                  >
                    Help
                  </Text>
                  <Text
                    style={[
                      tw`font-mono text-mb-mute uppercase text-[10px]`,
                      { letterSpacing: 2 },
                    ]}
                  >
                    guide · tips
                  </Text>
                </Pressable>
              </>
            }
          />
        </View>
      </View>
    </View>
  );
};
