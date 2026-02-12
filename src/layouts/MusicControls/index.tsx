import React, {useCallback, useEffect} from 'react';
import {TrayScreen} from '../../components/TrayScreen';
import {
  View,
  Text,
  Pressable,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import {useAudioPlayer} from '../../context/AudioPlayerContext';
import {useSelector, useDispatch} from 'react-redux';
import {
  musicFilesSelector,
  activeFileIdSelector,
} from '../../state/musicLibrary.selectors';
import {Icon} from '../../components/Icon';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Slider} from 'react-native-awesome-slider';
import {useSharedValue} from 'react-native-reanimated';
import tw from '../../utils/tw';
import Decimal from 'decimal.js';
import SwipeableItem from 'react-native-swipeable-item';
import {SwipeRightRemove} from '../../components/UnderlyingSwipe/SwipeRightRemove';
import {MusicTrackItem} from './MusicTrackItem';
import {MusicFile} from '../../types/music';
import {soundsEnabledSelector} from '../../state/configuration.selectors';
import {toggleSounds} from '../../state/configuration.reducer';

export const MusicControls = () => {
  const {width, height} = useWindowDimensions();
  const layoutWidth = Math.min(540, width);
  const {
    isPlaying,
    volume,
    setVolume,
    setLiveVolume,
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

  // Create shared values for the slider
  const progress = useSharedValue(
    Decimal(volume).toDecimalPlaces(2).toNumber(),
  );
  const min = useSharedValue(0);
  const max = useSharedValue(1);

  // Keep shared value in sync with volume from context
  useEffect(() => {
    progress.value = volume;
  }, [volume, progress]);

  const {bottom} = useSafeAreaInsets();
  const trayHeight = Math.min(height * 0.65, 500) + bottom;

  const renderItem = useCallback(
    ({item}: {item: MusicFile}) => (
      <SwipeableItem
        key={item.id}
        item={item}
        snapPointsLeft={[120]}
        renderUnderlayLeft={() => (
          <SwipeRightRemove
            drag={() => {}}
            onPressDelete={() => deleteFile(item.id)}
          />
        )}>
        <View style={tw`bg-black`}>
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
    <>
      <TrayScreen trayHeight={trayHeight}>
        <View style={tw`pt-6 px-2 flex-1`}>
          {/* Action buttons */}
          <View style={tw`flex-row items-center justify-center gap-3 mb-4`}>
            <Pressable
              style={tw`flex-row items-center px-4 py-2 rounded-full border border-neutral-600 active:opacity-80`}
              onPress={pasteUrl}
              disabled={isDownloading}>
              {isDownloading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Icon name="clipboard" color="white" size={16} />
                  <Text style={tw`ml-2 text-sm font-inter text-white`}>
                    Paste URL
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={tw`flex-row items-center px-4 py-2 rounded-full border border-neutral-600 active:opacity-80`}
              onPress={pickLocalFile}>
              <Icon name="folder" color="white" size={16} />
              <Text style={tw`ml-2 text-sm font-inter text-white`}>
                Pick File
              </Text>
            </Pressable>
          </View>

          {/* Exercise sounds toggle */}
          <Pressable
            style={tw`flex-row items-center justify-between px-4 py-3 mb-4 rounded-full border border-neutral-600`}
            onPress={() => dispatch(toggleSounds())}>
            <Text style={tw`text-sm font-inter text-white`}>
              Exercise Sounds
            </Text>
            <Text
              style={tw`text-sm font-inter ${
                soundsEnabled ? 'text-white' : 'text-neutral-500'
              }`}>
              {soundsEnabled ? 'On' : 'Off'}
            </Text>
          </Pressable>

          {/* Library list */}
          {files.length === 0 ? (
            <View style={tw`flex-1 items-center justify-center`}>
              <Text style={tw`text-base font-inter text-neutral-500`}>
                No tracks yet
              </Text>
            </View>
          ) : (
            <FlatList
              data={files}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              style={tw`flex-1`}
            />
          )}

          {/* Volume slider */}
          <View
            style={tw`mt-2 mb-2 items-center justify-center`}
            key={`${layoutWidth}`}>
            <Slider
              style={{width: layoutWidth - 96}}
              progress={progress}
              minimumValue={min}
              maximumValue={max}
              onValueChange={useCallback(
                (value: number) => {
                  setLiveVolume(value);
                },
                [setLiveVolume],
              )}
              onSlidingComplete={useCallback(
                (value: number) => {
                  setVolume(Decimal(value).toDecimalPlaces(2).toNumber());
                },
                [setVolume],
              )}
              theme={{
                minimumTrackTintColor: '#e5e5e5',
                maximumTrackTintColor: '#262626',
                bubbleBackgroundColor: '#000000',
              }}
              disableTrackFollow
            />
          </View>
          <View style={{height: bottom}} />
        </View>
      </TrayScreen>
    </>
  );
};
