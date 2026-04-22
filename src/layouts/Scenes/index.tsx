import React, { useCallback } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import tw from "../../utils/tw";
import { backgrounds } from "../Main/sources";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { sourceIndexSelector } from "../../state/configuration.selectors";
import { updateSource } from "../../state/configuration.reducer";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

const formatSceneName = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, "$1 $2");

type SortedScene = { name: string; originalIndex: number };

const NONE_INDEX = -1;

const sortedBackgrounds: SortedScene[] = [
  ...(backgrounds as unknown as string[])
    .map((name, originalIndex) => ({ name, originalIndex }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  { name: "Black", originalIndex: NONE_INDEX },
];

export const Scenes = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const activeIndex = useAppSelector(sourceIndexSelector);

  const renderItem = useCallback(
    ({ item, index }: { item: SortedScene; index: number }) => {
      const isActive = item.originalIndex === activeIndex;
      return (
        <Pressable
          onPress={() => dispatch(updateSource(item.originalIndex))}
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
              tw`font-display text-[18px] uppercase flex-1`,
              isActive ? tw`text-mb-accent` : tw`text-mb-fg`,
              { letterSpacing: -0.4 },
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
    [activeIndex, dispatch],
  );

  const keyExtractor = useCallback(
    (item: SortedScene) => String(item.originalIndex),
    [],
  );

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
            scenes
          </Text>
          <View style={tw`w-10`} />
        </View>

        {/* Hero */}
        <View style={tw`px-6 pt-2 pb-5`}>
          <Overline accent right={`${sortedBackgrounds.length} scenes`}>
            Ambient
          </Overline>
          <View style={tw`mt-5`}>
            <BigTitle size={44} accent>{`Choose\na space`}</BigTitle>
          </View>
        </View>

        <View style={tw`flex-1 px-6`}>
          <FlatList
            data={sortedBackgrounds}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={tw`pb-8`}
          />
        </View>
      </View>
    </View>
  );
};
