import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavigationProp, RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Icon } from "../../components/Icon";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { exerciseByIdSelector } from "../../state/exercises.selectors";
import { FlatList, LayoutAnimation, View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";
import { StepCard } from "./StepCard";

import DraggableFlatList, {
  OpacityDecorator,
  RenderItemParams,
  ScaleDecorator,
  ShadowDecorator,
} from "react-native-draggable-flatlist";
import SwipeableItem, {
  OpenDirection,
  useSwipeableItemParams,
} from "react-native-swipeable-item";
import {
  editExerciseName,
  removeExercise,
  updateExercise,
} from "../../state/exercises.reducer";
import { type Exercise as ExerciseItem } from "../../types/exercise";
import { SwipeRightRemove } from "../../components/UnderlyingSwipe";
import { useDebouncedCallback } from "use-debounce";
import { EditName } from "./EditName";
import { useParametrizedAppSelector } from "../../utils/selectors";

const OVERSWIPE_DIST = 20;
const SNAP_LEFT = [120];

interface Props {
  navigation: NavigationProp<MainStackParams, "Exercise">;
  route: RouteProp<MainStackParams, "Exercise">;
}

export const Exercise = ({ navigation, route }: Props) => {
  const {
    params: { id },
  } = route;
  const exercise = useParametrizedAppSelector(exerciseByIdSelector, id);
  const dispatch = useAppDispatch();

  const seqRef = useRef(exercise.seq);
  seqRef.current = exercise.seq;

  useEffect(() => {
    return () => {
      if (seqRef.current.length === 0) {
        dispatch(removeExercise({ exerciseId: id }));
      }
    };
  }, []);

  const itemRefs = useRef(new Map());

  const renderItem = useCallback(
    (params: RenderItemParams<ExerciseItem["seq"][number]>) => {
      const { item, drag } = params;
      const onPressDelete = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const updatedExercise = {
          ...exercise,
          seq: exercise.seq.filter((item) => item !== params.item),
        };

        dispatch(updateExercise({ exercise: updatedExercise }));
      };

      return (
        <ShadowDecorator>
          <ScaleDecorator>
            <OpacityDecorator>
              <SwipeableItem
                key={item.id}
                item={item}
                ref={(ref) => {
                  if (ref && !itemRefs.current.get(item.id)) {
                    itemRefs.current.set(item.id, ref);
                  }
                }}
                onChange={({ openDirection }) => {
                  if (openDirection !== OpenDirection.NONE) {
                    [...itemRefs.current.entries()].forEach(([key, ref]) => {
                      if (key !== item.id && ref) ref.close();
                    });
                  }
                }}
                overSwipe={OVERSWIPE_DIST}
                renderUnderlayLeft={() => (
                  <SwipeRightRemove onPressDelete={onPressDelete} drag={drag} />
                )}
                snapPointsLeft={SNAP_LEFT}
              >
                <StepCard exerciseId={id} step={item} drag={drag} />
              </SwipeableItem>
            </OpacityDecorator>
          </ScaleDecorator>
        </ShadowDecorator>
      );
    },
    [exercise],
  );

  return (
    <View style={tw`flex-1 bg-black`}>
      <View style={tw`flex-1 px-4 py-4`}>
        <View style={tw`flex-row px-4 justify-between items-center`}>
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => navigation.goBack()}
          >
            <Icon name="left-arrow" size={20} color="white" />
          </Pressable>
          <Text style={tw`text-base font-inter text-white`}>
            {exercise.name}
          </Text>
          <View style={tw`h-10 w-10 items-center justify-center`}></View>
        </View>

        <View style={tw`py-4 px-2`}>
          <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
            Edit name
          </Text>
          <EditName exerciseId={id} />
        </View>

        <View style={tw`flex-1`}>
          <DraggableFlatList
            data={exercise.seq}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            activationDistance={20}
            showsVerticalScrollIndicator={false}
            onDragEnd={(data) =>
              dispatch(
                updateExercise({
                  exercise: {
                    ...exercise,
                    seq: data.data,
                  },
                }),
              )
            }
            ListHeaderComponent={() => (
              <View style={tw`mt-6 px-2`}>
                <View style={tw`border-b border-neutral-800`}>
                  <Text style={tw`text-xs font-inter text-neutral-400 mb-2`}>
                    Steps
                  </Text>
                </View>
              </View>
            )}
            ListFooterComponent={() => (
              <View style={tw`py-4 mb-8`}>
                <Pressable
                  style={tw`items-center justify-center active:opacity-80`}
                  onPress={() =>
                    navigation.navigate("NewStepMenu", { exerciseId: id })
                  }
                >
                  <Text style={tw`text-base font-inter text-blue-500`}>
                    Add step
                  </Text>
                </Pressable>
                <Text
                  style={tw`text-xs font-inter text-neutral-600 text-center mt-1`}
                >
                  Long press to reorder. Swipe left to delete.
                </Text>
              </View>
            )}
          />
        </View>
      </View>
    </View>
  );
};
