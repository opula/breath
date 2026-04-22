import React, { useCallback, useEffect, useRef } from "react";
import {
  NavigationProp,
  RouteProp,
} from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { useAppDispatch } from "../../hooks/store";
import { exerciseByIdSelector } from "../../state/exercises.selectors";
import { LayoutAnimation, View, Text, Pressable } from "react-native";
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
} from "react-native-swipeable-item";
import {
  removeExercise,
  updateExercise,
} from "../../state/exercises.reducer";
import { type Exercise as ExerciseItem } from "../../types/exercise";
import { SwipeRightRemove } from "../../components/UnderlyingSwipe";
import { EditName } from "./EditName";
import { EditDescription } from "./EditDescription";
import { useParametrizedAppSelector } from "../../utils/selectors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Overline } from "../../components/Overline";
import { LAST_EXERCISE, storage } from "../../utils/storage";

const OVERSWIPE_DIST = 20;
const SNAP_LEFT = [120];

interface Props {
  navigation: NavigationProp<MainStackParams, "Exercise">;
  route: RouteProp<MainStackParams, "Exercise">;
}

export const Exercise = ({ navigation, route }: Props) => {
  const { id } = route.params;
  const exercise = useParametrizedAppSelector(exerciseByIdSelector, id);
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const seqRef = useRef(exercise.seq);
  seqRef.current = exercise.seq;

  // Clean up empty exercises on close.
  useEffect(() => {
    return () => {
      if (seqRef.current.length === 0) {
        dispatch(removeExercise({ exerciseId: id }));
      }
    };
  }, []);

  const itemRefs = useRef(new Map());

  const handleRun = useCallback(() => {
    // Find this exercise in the list to set its engine index.
    const state = exercise;
    // exercises order isn't trivially exposed here; engine will use its own
    // last-remembered index. Callers expecting this behaviour should navigate
    // from Home/tray instead. We still close back and hop to Main with autoplay.
    navigation.navigate("Main", { autoplay: true });
  }, [navigation, exercise]);

  const renderItem = useCallback(
    (params: RenderItemParams<ExerciseItem["seq"][number]>) => {
      const { item, drag, getIndex } = params;
      const index = getIndex() ?? 0;

      const onPressDelete = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const updatedExercise = {
          ...exercise,
          seq: exercise.seq.filter((s) => s !== item),
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
                <View style={tw`bg-mb-bg`}>
                  <StepCard
                    exerciseId={id}
                    step={item}
                    index={index}
                    drag={drag}
                  />
                </View>
              </SwipeableItem>
            </OpacityDecorator>
          </ScaleDecorator>
        </ShadowDecorator>
      );
    },
    [exercise, dispatch, id],
  );

  const handleDelete = useCallback(() => {
    dispatch(removeExercise({ exerciseId: id }));
    // Clear the LAST_EXERCISE pointer if it happens to match, otherwise engine
    // will still function against the remaining list.
    navigation.goBack();
  }, [dispatch, id, navigation]);

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
            · edit exercise
          </Text>
          <Pressable
            onPress={handleRun}
            style={tw`py-2 active:opacity-60`}
          >
            <Text
              style={[
                tw`font-mono text-mb-accent uppercase text-[10px]`,
                { letterSpacing: 3 },
              ]}
            >
              run →
            </Text>
          </Pressable>
        </View>

        <View style={tw`flex-1 px-6`}>
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
            ListHeaderComponent={
              <View style={tw`pb-4`}>
                <Overline
                  accent
                  right={`${exercise.seq.length} phases`}
                >
                  Definition
                </Overline>
                <View style={tw`mt-5`}>
                  <EditName exerciseId={id} />
                </View>
                <View style={tw`mt-4 mb-6`}>
                  <EditDescription exerciseId={id} />
                </View>
                <Overline right="tap to adjust">Phases</Overline>
              </View>
            }
            ListEmptyComponent={() => (
              <View style={tw`py-6`}>
                <Text
                  style={[
                    tw`font-mono text-mb-mute uppercase text-[10px]`,
                    { letterSpacing: 2 },
                  ]}
                >
                  · no phases yet — add your first below
                </Text>
              </View>
            )}
            ListFooterComponent={() => (
              <View style={tw`pb-10`}>
                {/* Add phase row */}
                <Pressable
                  onPress={() =>
                    navigation.navigate("NewStepMenu", { exerciseId: id })
                  }
                  style={({ pressed }) => [
                    tw`flex-row items-center py-5 border-b border-mb-line`,
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
                      tw`font-display text-mb-fg uppercase text-[18px]`,
                      { letterSpacing: -0.4 },
                    ]}
                  >
                    Add phase
                  </Text>
                  <View style={tw`flex-1`} />
                  <Text
                    style={[
                      tw`font-mono text-mb-mute uppercase text-[9px]`,
                      { letterSpacing: 1.8 },
                    ]}
                  >
                    + phase
                  </Text>
                </Pressable>

                {/* Danger zone */}
                <View style={tw`mt-8`}>
                  <Overline>Danger</Overline>
                  <Pressable
                    onPress={handleDelete}
                    style={({ pressed }) => [
                      tw`flex-row items-center py-5 border-b border-mb-line`,
                      pressed && tw`opacity-70`,
                    ]}
                  >
                    {/* Index-column spacer to align with step rows */}
                    <View style={tw`w-8`} />
                    <Text
                      style={[
                        tw`font-display text-mb-warn uppercase text-[18px] flex-1`,
                        { letterSpacing: -0.4 },
                      ]}
                    >
                      Delete exercise
                    </Text>
                    <Text
                      style={[
                        tw`font-mono text-mb-warn uppercase text-[9px]`,
                        { letterSpacing: 2 },
                      ]}
                    >
                      · permanent
                    </Text>
                  </Pressable>
                </View>

                {exercise.seq.length ? (
                  <Text
                    style={[
                      tw`font-mono text-mb-dim uppercase text-center text-[9px] mt-6`,
                      { letterSpacing: 2 },
                    ]}
                  >
                    long press to reorder · swipe left to delete
                  </Text>
                ) : null}
              </View>
            )}
          />
        </View>
      </View>
    </View>
  );
};
