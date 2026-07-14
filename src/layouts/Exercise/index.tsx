import React, { useCallback, useEffect, useRef } from "react";
import { NavigationProp, RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { exerciseById, exercises$ } from "../../state/exercises.atom";
import { setLastPlayed } from "../../state/lastPlayed.atom";
import { use$ } from "concordia/react";
import { NavHeader } from "../../components/NavHeader";
import { LayoutAnimation, View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";
import { StepCard } from "./StepCard";

import DraggableFlatList, {
  OpacityDecorator,
  RenderItemParams,
  ScaleDecorator,
  ShadowDecorator,
} from "react-native-draggable-flatlist";
import SwipeableItem, { OpenDirection } from "react-native-swipeable-item";
import { removeExercise, updateExercise } from "../../state/exercises.atom";
import { type Exercise as ExerciseItem } from "../../types/exercise";
import { SwipeRightRemove } from "../../components/UnderlyingSwipe";
import { EditName } from "./EditName";
import { EditDescription } from "./EditDescription";
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
  const exercise = use$(exerciseById(id));
  const exercises = use$(exercises$.userExercises);
  const insets = useSafeAreaInsets();

  const seqRef = useRef(exercise.seq);
  seqRef.current = exercise.seq;

  // Clean up empty exercises on close.
  useEffect(() => {
    return () => {
      if (seqRef.current.length === 0) {
        removeExercise(id);
      }
    };
  }, []);

  const itemRefs = useRef(new Map());

  const handleRun = useCallback(() => {
    const index = exercises.findIndex((e) => e.id === id);
    if (index >= 0) {
      storage.set(LAST_EXERCISE, index);
      setLastPlayed(id);
    }
    navigation.navigate("Main", { autoplay: true });
  }, [exercises, id, navigation]);

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
        updateExercise(updatedExercise);
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
    [exercise, id],
  );

  const handleDelete = useCallback(() => {
    removeExercise(id);
    // Clear the LAST_EXERCISE pointer if it happens to match, otherwise engine
    // will still function against the remaining list.
    navigation.goBack();
  }, [id, navigation]);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top nav */}
        <NavHeader
          title="edit exercise"
          onClose={() => navigation.goBack()}
          leftAction={{ label: "run now", onPress: handleRun, accent: true }}
        />

        <View style={tw`flex-1 px-6`}>
          <DraggableFlatList
            data={exercise.seq}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            activationDistance={20}
            showsVerticalScrollIndicator={false}
            onDragEnd={(data) =>
              updateExercise({
                ...exercise,
                seq: data.data,
              })
            }
            ListHeaderComponent={
              <View style={tw`pb-4`}>
                <Overline
                  accent
                  right={`${exercise.seq.length} phase${exercise.seq.length === 1 ? "" : "s"}`}
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
                  no phases yet · add your first below
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
                      tw`font-item text-mb-ink text-[18px]`,
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
                    <Text
                      style={[
                        tw`font-item text-mb-warn text-[18px] flex-1`,
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
                      permanent
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
