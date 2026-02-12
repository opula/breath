import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { exercisesSelector } from "../../state/exercises.selectors";
import { LayoutAnimation, View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";
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
import { Exercise } from "../../types/exercise";
import { SwipeRightRemove } from "../../components/UnderlyingSwipe";
import { ExerciseItem } from "./ExerciseItem";
import { Header } from "./Header";
import { SafeAreaView } from "react-native-safe-area-context";

const OVERSWIPE_DIST = 20;
const SNAP_LEFT = [120];

interface Props {
  navigation: NavigationProp<MainStackParams, "ExercisesList">;
}

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

  const renderItem = useCallback(
    (params: RenderItemParams<Exercise>) => {
      const { item, getIndex, drag, isActive } = params;
      const index = getIndex();

      const onPressDelete = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        dispatch(removeExercise({ exerciseId: item.id }));
      };

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
      <View style={tw`py-4 mb-8`}>
        <Pressable
          style={tw`items-center justify-center active:opacity-80`}
          onPress={() => dispatch(resetExercises())}
        >
          <Text style={tw`text-base font-inter`}>Reset exercises</Text>
        </Pressable>
      </View>
    ),
    [dispatch],
  );

  return (
    <View style={tw`flex-1 bg-black bg-opacity-50`}>
      <SafeAreaView>
        <View style={tw`px-0 pb-4`}>
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
