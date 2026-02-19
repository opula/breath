import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { exercisesSelector } from "../../state/exercises.selectors";
import {
  Alert,
  LayoutAnimation,
  Share,
  View,
  Text,
  Pressable,
} from "react-native";
import tw from "../../utils/tw";
import * as Clipboard from "expo-clipboard";
import uuid from "react-native-uuid";
import { Exercise } from "../../types/exercise";
import {
  updateExercises,
  resetExercises,
  removeExercise,
} from "../../state/exercises.reducer";
import DraggableFlatList, {
  DragEndParams,
  OpacityDecorator,
  RenderItemParams,
  ScaleDecorator,
  ShadowDecorator,
} from "react-native-draggable-flatlist";
import SwipeableItem, { OpenDirection } from "react-native-swipeable-item";
import type { SwipeableItemImperativeRef } from "react-native-swipeable-item";
import { SwipeRightRemove, SwipeRightActions } from "../../components/UnderlyingSwipe";
import { isExerciseEligibleForBackground } from "../../services/BackgroundAudio/exerciseEligibility";
import { ExerciseItem } from "./ExerciseItem";
import { Header } from "./Header";
import { SafeAreaView } from "react-native-safe-area-context";

const OVERSWIPE_DIST = 20;
const SNAP_LEFT = [120];
const SNAP_RIGHT = [120];

interface Props {
  navigation: NavigationProp<MainStackParams, "ExercisesList">;
}

const VALID_STEP_TYPES = ["inhale", "exhale", "hold", "breath", "text", "double-inhale"];

const isValidExercise = (e: unknown): e is Exercise => {
  if (!e || typeof e !== "object") return false;
  const obj = e as Record<string, unknown>;
  if (typeof obj.name !== "string" || !Array.isArray(obj.seq)) return false;
  return obj.seq.every((s: unknown) => {
    if (!s || typeof s !== "object") return false;
    const step = s as Record<string, unknown>;
    return (
      typeof step.type === "string" &&
      VALID_STEP_TYPES.includes(step.type) &&
      typeof step.count === "number"
    );
  });
};

const assignIds = (exercises: Exercise[]): Exercise[] =>
  exercises.map((e) => ({
    ...e,
    id: uuid.v4() as string,
    seq: e.seq.map((s) => ({ ...s, id: uuid.v4() as string })),
  }));

export const ExercisesList = ({ navigation }: Props) => {
  const exercises = useAppSelector(exercisesSelector);
  const dispatch = useAppDispatch();
  const itemRefs = useRef(new Map<string, SwipeableItemImperativeRef>());

  useEffect(() => {
    const activeIds = new Set(exercises.map((exercise) => exercise.id));
    itemRefs.current.forEach((_, exerciseId) => {
      if (!activeIds.has(exerciseId)) {
        itemRefs.current.delete(exerciseId);
      }
    });
  }, [exercises]);

  const onDragEnd = useCallback(
    (data: DragEndParams<Exercise>) => {
      dispatch(updateExercises({ exercises: data.data }));
    },
    [dispatch],
  );

  const handleExport = useCallback(async () => {
    const json = JSON.stringify(exercises, null, 2);
    await Share.share({ message: json });
  }, [exercises]);

  const handleImport = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) {
      Alert.alert("Nothing to import", "Your clipboard is empty.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      Alert.alert("Invalid JSON", "The clipboard content is not valid JSON.");
      return;
    }

    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (!arr.every(isValidExercise)) {
      Alert.alert(
        "Invalid format",
        "The JSON does not match the expected exercise format.",
      );
      return;
    }

    const withIds = assignIds(arr);
    Alert.alert(
      "Import exercises",
      `Replace all exercises with ${withIds.length} imported exercise${withIds.length === 1 ? "" : "s"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          onPress: () => dispatch(updateExercises({ exercises: withIds })),
        },
      ],
    );
  }, [dispatch]);

  const renderItem = useCallback(
    (params: RenderItemParams<Exercise>) => {
      const { item, getIndex, drag, isActive } = params;
      const index = getIndex();
      const isEligible = isExerciseEligibleForBackground(item);

      const onPressDelete = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        dispatch(removeExercise({ exerciseId: item.id }));
      };

      const onPressBackground = isEligible
        ? () => navigation.navigate("BackgroundAudio", { id: item.id })
        : undefined;

      const row = (
        <SwipeableItem
          item={item}
          ref={(ref) => {
            if (ref) {
              itemRefs.current.set(item.id, ref);
            } else {
              itemRefs.current.delete(item.id);
            }
          }}
          onChange={({ openDirection }) => {
            if (openDirection !== OpenDirection.NONE) {
              [...itemRefs.current.entries()].forEach(([key, ref]) => {
                if (key !== item.id) {
                  ref.close();
                }
              });
            }
          }}
          overSwipe={OVERSWIPE_DIST}
          renderUnderlayLeft={() => (
            <SwipeRightRemove onPressDelete={onPressDelete} drag={drag} />
          )}
          snapPointsLeft={SNAP_LEFT}
          {...(isEligible
            ? {
                renderUnderlayRight: () => (
                  <SwipeRightActions
                    onPressBackground={onPressBackground!}
                    drag={drag}
                  />
                ),
                snapPointsRight: SNAP_RIGHT,
              }
            : {})}
        >
          <ExerciseItem {...{ item, index, drag, navigation }} />
        </SwipeableItem>
      );

      if (!isActive) {
        return row;
      }

      return (
        <ShadowDecorator>
          <ScaleDecorator>
            <OpacityDecorator>{row}</OpacityDecorator>
          </ScaleDecorator>
        </ShadowDecorator>
      );
    },
    [dispatch, navigation],
  );

  const keyExtractor = useCallback((item: Exercise) => item.id, []);

  const listFooter = useMemo(
    () => (
      <View style={tw`py-6 mb-8 gap-3`}>
        <Text
          style={tw`text-xs font-inter text-neutral-600 text-center`}
        >
          Long press to reorder. Swipe left to delete.
        </Text>
        <View style={tw`flex-row justify-center gap-6 mt-2`}>
          <Pressable
            style={tw`active:opacity-80`}
            onPress={handleExport}
          >
            <Text style={tw`text-sm font-inter text-neutral-400`}>
              Export
            </Text>
          </Pressable>
          <Pressable
            style={tw`active:opacity-80`}
            onPress={handleImport}
          >
            <Text style={tw`text-sm font-inter text-neutral-400`}>
              Import
            </Text>
          </Pressable>
          <Pressable
            style={tw`active:opacity-80`}
            onPress={() => dispatch(resetExercises())}
          >
            <Text style={tw`text-sm font-inter text-neutral-400`}>
              Reset
            </Text>
          </Pressable>
        </View>
      </View>
    ),
    [dispatch, handleExport, handleImport],
  );

  return (
    <View style={tw`flex-1 bg-black bg-opacity-50`}>
      <SafeAreaView style={tw`flex-1`}>
        <View style={tw`flex-1`}>
          <Header navigation={navigation} />

          <DraggableFlatList
            data={exercises}
            renderItem={renderItem}
            onDragEnd={onDragEnd}
            keyExtractor={keyExtractor}
            activationDistance={20}
            showsVerticalScrollIndicator={false}
            maxToRenderPerBatch={5}
            initialNumToRender={5}
            windowSize={5}
            updateCellsBatchingPeriod={32}
            ListFooterComponent={listFooter}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};
