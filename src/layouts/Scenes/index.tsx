import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { AnimatePresence, MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import tw from "../../utils/tw";
import { backgroundSources, NO_BACKGROUND_SOURCE_ID } from "../Main/sources";
import { BackgroundSurface } from "../Main/Background";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  isGrayscaleSelector,
  sourceIdSelector,
} from "../../state/configuration.selectors";
import { updateSource } from "../../state/configuration.reducer";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";
import { NavHeader } from "../../components/NavHeader";
import type {
  BackgroundSourceId,
  SceneSourceId,
} from "../../backgrounds/metadata";

const PREVIEW_DURATION_MS = 5000;
const PREVIEW_FADE_MS = 600;

const formatSceneName = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, "$1 $2");

type SortedScene = { id: SceneSourceId; name: string };

const sortedBackgrounds: SortedScene[] = [
  ...backgroundSources
    .map((source) => ({ id: source.id, name: source.name }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  { id: NO_BACKGROUND_SOURCE_ID, name: "Black" },
];

export const Scenes = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const activeSourceId = useAppSelector(sourceIdSelector);
  const isGrayscale = useAppSelector(isGrayscaleSelector);

  const [previewSourceId, setPreviewSourceId] =
    useState<BackgroundSourceId | null>(null);
  const [isPreviewReady, setIsPreviewReady] = useState(false);

  const listRef = useRef<FlatList<SortedScene>>(null);
  const activeSourceIdRef = useRef(activeSourceId);
  activeSourceIdRef.current = activeSourceId;

  // After mount, animate the list down to the active scene if it isn't already
  // near the top. Runs once per modal open.
  useEffect(() => {
    const id = activeSourceIdRef.current;
    if (!id) return;
    const idx = sortedBackgrounds.findIndex((s) => s.id === id);
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

  // Drop preview when leaving the screen so no shader keeps running.
  useFocusEffect(
    useCallback(
      () => () => {
        setPreviewSourceId(null);
        setIsPreviewReady(false);
      },
      [],
    ),
  );

  // Arm the dismissal timer only once the shader has signaled ready, so the
  // visible preview lasts the full PREVIEW_DURATION regardless of init cost.
  useEffect(() => {
    if (!previewSourceId || !isPreviewReady) return;
    const id = setTimeout(() => {
      setPreviewSourceId(null);
      setIsPreviewReady(false);
    }, PREVIEW_DURATION_MS);
    return () => clearTimeout(id);
  }, [previewSourceId, isPreviewReady]);

  const handleSelect = useCallback(
    (id: SceneSourceId) => {
      dispatch(updateSource(id));
      if (id === NO_BACKGROUND_SOURCE_ID) {
        setPreviewSourceId(null);
        setIsPreviewReady(false);
        return;
      }
      setPreviewSourceId(id);
      setIsPreviewReady(false);
    },
    [dispatch],
  );

  const handlePreviewReady = useCallback(() => {
    setIsPreviewReady(true);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: SortedScene; index: number }) => {
      const isActive = item.id === activeSourceId;
      return (
        <Pressable
          onPress={() => handleSelect(item.id)}
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
          >
            {formatSceneName(item.name)}
          </Text>
          <View
            style={[
              tw`w-[10px] h-[10px] rounded-full border`,
              isActive
                ? { backgroundColor: "#6FE7FF", borderColor: "#6FE7FF" }
                : { borderColor: "#6E6E74" },
            ]}
          />
        </Pressable>
      );
    },
    [activeSourceId, handleSelect],
  );

  const keyExtractor = useCallback((item: SortedScene) => item.id, []);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      {/* Preview layer — fades in behind the list when a scene is tapped. */}
      <View style={tw`absolute inset-0`} pointerEvents="none">
        <AnimatePresence>
          {previewSourceId ? (
            <MotiView
              key={previewSourceId}
              style={tw`absolute inset-0`}
              from={{ opacity: 0 }}
              animate={{ opacity: isPreviewReady ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { type: "timing", duration: PREVIEW_FADE_MS },
              }}
            >
              <BackgroundSurface
                sourceId={previewSourceId}
                isGrayscale={isGrayscale}
                onReady={handlePreviewReady}
              />
              <View
                style={[
                  tw`absolute inset-0`,
                  { backgroundColor: "rgba(10,10,11,0.55)" },
                ]}
              />
            </MotiView>
          ) : null}
        </AnimatePresence>
      </View>

      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top nav */}
        <NavHeader title="scenes" onClose={() => navigation.goBack()} />

        {/* Hero */}
        <View style={tw`px-6 pt-2 pb-5`}>
          <Overline accent right={`${sortedBackgrounds.length} scenes`}>
            Immersive
          </Overline>
          <View style={tw`mt-5`}>
            <BigTitle size={44} accent>{`Choose\nyour space`}</BigTitle>
          </View>
        </View>

        <View style={tw`flex-1 px-6`}>
          <FlatList
            ref={listRef}
            data={sortedBackgrounds}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            onScrollToIndexFailed={onScrollToIndexFailed}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={tw`pb-8`}
          />
        </View>
      </View>
    </View>
  );
};
