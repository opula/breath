import React, { useCallback } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import tw from "../../utils/tw";
import { backgrounds } from "../Main/sources";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { sourceIndexSelector } from "../../state/configuration.selectors";
import { updateSource } from "../../state/configuration.reducer";

const MINT_BLUE = "#6FE7FF";

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
  const dispatch = useAppDispatch();
  const activeIndex = useAppSelector(sourceIndexSelector);

  const renderItem = useCallback(
    ({ item }: { item: SortedScene }) => {
      const isActive = item.originalIndex === activeIndex;
      const isBlack = item.originalIndex === NONE_INDEX;
      return (
        <Pressable
          style={[
            tw`px-8 py-4 active:opacity-80`,
            isBlack && tw`border-t border-neutral-800`,
          ]}
          onPress={() => dispatch(updateSource(item.originalIndex))}
        >
          <Text
            style={[
              tw`text-sm font-inter`,
              { color: isActive ? MINT_BLUE : "#a3a3a3" },
            ]}
          >
            {formatSceneName(item.name)}
          </Text>
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
    <View style={tw`flex-1 bg-black bg-opacity-50`}>
      <SafeAreaView style={tw`flex-1`}>
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
            Scenes
          </Text>
          <View style={tw`h-10 w-10`} />
        </View>

        <FlatList
          data={sortedBackgrounds}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
        />
      </SafeAreaView>
    </View>
  );
};
