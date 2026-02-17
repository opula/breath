import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { useSelector, useDispatch } from "react-redux";
import {
  musicFilesSelector,
  activeFileIdSelector,
} from "../../state/musicLibrary.selectors";
import { Icon } from "../../components/Icon";
import { HorizontalDial } from "../../components/HorizontalDial";
import tw from "../../utils/tw";
import SwipeableItem from "react-native-swipeable-item";
import { SwipeRightRemove } from "../../components/UnderlyingSwipe/SwipeRightRemove";
import { MusicTrackItem } from "./MusicTrackItem";
import { MusicFile } from "../../types/music";
import { soundsEnabledSelector } from "../../state/configuration.selectors";
import { toggleSounds } from "../../state/configuration.reducer";

export const MusicControls = () => {
  const navigation = useNavigation();
  const {
    isPlaying,
    volume,
    setVolume,
    pickLocalFile,
    pasteUrl,
    playFile,
    deleteFile,
    isDownloading,
  } = useAudioPlayer();

  const dispatch = useDispatch();
  const files = useSelector(musicFilesSelector);
  const activeFileId = useSelector(activeFileIdSelector);
  const soundsEnabled = useSelector(soundsEnabledSelector);

  const onVolumeChange = useCallback(
    (value: number) => {
      setVolume(value / 100);
    },
    [setVolume],
  );

  const renderItem = useCallback(
    ({ item }: { item: MusicFile }) => (
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
        <View>
          <MusicTrackItem
            item={item}
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
    <View style={tw`flex-1 bg-black bg-opacity-50`}>
      <SafeAreaView style={tw`flex-1`}>
        {/* Header */}
        <View
          style={tw`flex-row px-4 pb-2 justify-between items-center border-b border-neutral-800`}
        >
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={20} color="white" />
          </Pressable>
          <Text style={tw`text-sm font-inter font-medium text-neutral-200`}>
            Music
          </Text>
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => dispatch(toggleSounds())}
          >
            <Icon
              name="headphones"
              size={20}
              color={soundsEnabled ? "white" : "#737373"}
            />
          </Pressable>
        </View>

        {/* Library list */}
        {files.length === 0 ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <Text style={tw`text-base font-inter text-neutral-500`}>
              No tracks yet
            </Text>
          </View>
        ) : (
          <View style={tw`flex-1`}>
            <FlatList
              data={files}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
            />
          </View>
        )}

        {/* Volume dial */}
        <View style={tw`py-6 border-t border-neutral-800 pl-8`}>
          <HorizontalDial
            min={0}
            max={100}
            step={1}
            suffix="%"
            defaultValue={Math.round(volume * 100)}
            onChange={onVolumeChange}
          />
        </View>

        {/* Action buttons */}
        <View
          style={tw`flex-row items-center justify-start gap-3 pt-4 mb-2 pr-4 pl-8 border-t border-neutral-800`}
        >
          <Text style={tw`text-white text-sm`}>Add music</Text>
          <Pressable
            style={tw`flex-row items-center px-4 py-2 rounded-full border border-neutral-600 active:opacity-80`}
            onPress={pasteUrl}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Icon name="clipboard" color="white" size={14} />
                <Text style={tw`ml-2 text-xs font-inter text-white`}>
                  Paste URL
                </Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={tw`flex-row items-center px-4 py-2 rounded-full border border-neutral-600 active:opacity-80`}
            onPress={pickLocalFile}
          >
            <Icon name="folder" color="white" size={14} />
            <Text style={tw`ml-2 text-xs font-inter text-white`}>
              Pick File
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
};
