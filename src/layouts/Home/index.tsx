import React, { useMemo } from "react";
import { View, ScrollView, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationProp } from "@react-navigation/native";
import uuid from "react-native-uuid";
import tw from "../../utils/tw";
import { BigTitle } from "../../components/BigTitle";
import { Overline } from "../../components/Overline";
import { ExerciseRow } from "../../components/ExerciseRow";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { exercisesSelector } from "../../state/exercises.selectors";
import { favoritesSelector } from "../../state/favorites.selectors";
import { lastPlayedExerciseIdSelector } from "../../state/lastPlayed.selectors";
import { setLastPlayed } from "../../state/lastPlayed.reducer";
import { addExercise } from "../../state/exercises.reducer";
import { MainStackParams } from "../../navigation";
import { LAST_EXERCISE, storage } from "../../utils/storage";

interface Props {
  navigation: NavigationProp<MainStackParams, "Home">;
}

export const Home = ({ navigation }: Props) => {
  const dispatch = useAppDispatch();
  const exercises = useAppSelector(exercisesSelector);
  const favorites = useAppSelector(favoritesSelector);
  const lastPlayed = useAppSelector(lastPlayedExerciseIdSelector);
  const insets = useSafeAreaInsets();

  const sorted = useMemo(() => {
    const favs = exercises.filter((e) => favorites.includes(e.id));
    const rest = exercises.filter((e) => !favorites.includes(e.id));
    return [...favs, ...rest];
  }, [exercises, favorites]);

  const handleTapExercise = (exerciseId: string) => {
    const index = exercises.findIndex((e) => e.id === exerciseId);
    if (index >= 0) {
      storage.set(LAST_EXERCISE, index);
      dispatch(setLastPlayed(exerciseId));
    }
    navigation.navigate("Main", { autoplay: true });
  };

  const handleLongPressExercise = (exerciseId: string) => {
    navigation.navigate("ExerciseActions", { exerciseId });
  };

  const handleNewExercise = () => {
    const id = uuid.v4() as string;
    dispatch(addExercise({ exerciseId: id }));
    navigation.navigate("Exercise", { id });
  };

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      {/* Content column: fills everything above the tab strip */}
      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top mono label */}
        <View style={tw`flex-row justify-between px-6 pt-2 pb-3`}>
          <Text
            style={[
              tw`font-mono text-[9px] text-mb-mute uppercase`,
              { letterSpacing: 3 },
            ]}
          >
            MID BREATH
          </Text>
        </View>

        {/* Hero */}
        <View style={tw`px-6 pt-4 pb-6`}>
          <BigTitle size={44} accent>{`Mid\nBreath`}</BigTitle>
        </View>

        {/* Library list */}
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`px-6 pb-8`}
          showsVerticalScrollIndicator={false}
        >
          <Overline right={`tap to play · hold for more`}>
            Library ({exercises.length})
          </Overline>

          {sorted.map((ex, i) => (
            <ExerciseRow
              key={ex.id}
              exercise={ex}
              index={i}
              isFavorite={favorites.includes(ex.id)}
              isLastPlayed={lastPlayed === ex.id}
              onPress={() => handleTapExercise(ex.id)}
              onLongPress={() => handleLongPressExercise(ex.id)}
            />
          ))}

          {/* New exercise affordance */}
          <Pressable
            onPress={handleNewExercise}
            style={({ pressed }) => [
              tw`flex-row items-center py-5 border-b border-mb-line`,
              pressed && tw`opacity-70`,
            ]}
          >
            <View style={tw`w-3`} />
            <Text
              style={[
                tw`font-mono text-[10px] text-mb-accent uppercase w-8`,
                { letterSpacing: 1.5 },
              ]}
            >
              +
            </Text>
            <Text
              style={[
                tw`font-display text-[22px] text-mb-fg uppercase`,
                { letterSpacing: -0.5 },
              ]}
            >
              New exercise
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Bottom tab strip — sibling of the content column so it always sits at the bottom */}
      <View
        style={[
          tw`flex-row border-t border-mb-line bg-mb-bg`,
          { paddingBottom: insets.bottom },
        ]}
      >
        {(
          [
            { label: "Scenes", target: "Scenes" },
            { label: "Sound", target: "MusicControls" },
            { label: "Settings", target: "Settings" },
          ] as const
        ).map((b, i) => (
          <Pressable
            key={b.target}
            onPress={() => navigation.navigate(b.target)}
            style={({ pressed }) => [
              tw.style(
                `flex-1 items-center py-5`,
                i > 0 && `border-l border-mb-line`,
              ),
              pressed && tw`opacity-60`,
            ]}
          >
            <Text
              style={[
                tw`font-mono text-[10px] text-mb-fg uppercase`,
                { letterSpacing: 2.5 },
              ]}
            >
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};
