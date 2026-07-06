import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  Text,
  Pressable,
  LayoutChangeEvent,
} from "react-native";
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
import {
  lastPlayedAtSelector,
  lastPlayedExerciseIdSelector,
} from "../../state/lastPlayed.selectors";
import { setLastPlayed } from "../../state/lastPlayed.reducer";
import { addExercise } from "../../state/exercises.reducer";
import { MainStackParams } from "../../navigation";
import { LAST_EXERCISE, storage } from "../../utils/storage";
import { formatRelativeTime } from "../../utils/pretty";

interface Props {
  navigation: NavigationProp<MainStackParams, "Home">;
}

export const Home = ({ navigation }: Props) => {
  const dispatch = useAppDispatch();
  const exercises = useAppSelector(exercisesSelector);
  const favorites = useAppSelector(favoritesSelector);
  const lastPlayed = useAppSelector(lastPlayedExerciseIdSelector);
  const lastPlayedAt = useAppSelector(lastPlayedAtSelector);
  const insets = useSafeAreaInsets();

  const sorted = useMemo(() => {
    const favs = exercises.filter((e) => favorites.includes(e.id));
    const rest = exercises.filter((e) => !favorites.includes(e.id));
    return [...favs, ...rest];
  }, [exercises, favorites]);

  const lastSessionLabel = useMemo(
    () => (lastPlayedAt ? formatRelativeTime(lastPlayedAt) : null),
    [lastPlayedAt],
  );

  // Scroll to the last-played row once it lays out, so users land on their
  // most recent session without having to hunt for it. Fires only once per
  // mount and only if the row is far enough down to be worth animating to.
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledToLastPlayedRef = useRef(false);
  const handleLastPlayedLayout = useCallback((e: LayoutChangeEvent) => {
    if (hasScrolledToLastPlayedRef.current) return;
    const y = e.nativeEvent.layout.y;
    if (y < 160) return;
    hasScrolledToLastPlayedRef.current = true;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - 80),
        animated: true,
      });
    }, 250);
  }, []);

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

  const handleFreestyle = () => {
    navigation.navigate("Freestyle");
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
        {/* Top mono label — last session, or a welcome on first run */}
        <View style={tw`flex-row justify-between px-6 pt-2 pb-3`}>
          {lastSessionLabel ? (
            <Text
              numberOfLines={1}
              style={[tw`font-mono text-[9px] uppercase`, { letterSpacing: 3 }]}
            >
              <Text style={tw`text-mb-mute`}>LAST SESSION · </Text>
              <Text style={tw`text-mb-fg`}>{lastSessionLabel}</Text>
            </Text>
          ) : (
            <Text
              style={[tw`font-mono text-[9px] uppercase`, { letterSpacing: 3 }]}
            >
              <Text style={tw`text-mb-accent`}>WELCOME · </Text>
              <Text style={tw`text-mb-mute`}>your first session</Text>
            </Text>
          )}
        </View>

        {/* Hero */}
        <View style={tw`px-6 pt-4 pb-6`}>
          <BigTitle size={44} accent>{`Mid\nBreath`}</BigTitle>
        </View>

        {/* Library list */}
        <ScrollView
          ref={scrollRef}
          style={tw`flex-1`}
          contentContainerStyle={tw`px-6 pb-8`}
          showsVerticalScrollIndicator={false}
        >
          <Overline right={`tap to play · hold for more`}>
            Library ({exercises.length})
          </Overline>

          {sorted.map((ex, i) => {
            const isLastPlayed = lastPlayed === ex.id;
            const row = (
              <ExerciseRow
                exercise={ex}
                index={i}
                isFavorite={favorites.includes(ex.id)}
                isLastPlayed={isLastPlayed}
                onPress={() => handleTapExercise(ex.id)}
                onLongPress={() => handleLongPressExercise(ex.id)}
              />
            );
            return isLastPlayed ? (
              <View key={ex.id} onLayout={handleLastPlayedLayout}>
                {row}
              </View>
            ) : (
              <React.Fragment key={ex.id}>{row}</React.Fragment>
            );
          })}

          <Pressable
            onPress={handleFreestyle}
            onLongPress={handleFreestyle}
            style={({ pressed }) => [
              tw`flex-row items-center py-5 border-b border-mb-line`,
              pressed && tw`opacity-70`,
            ]}
          >
            <Text
              style={[
                tw`font-mono text-[10px] text-mb-mute uppercase w-8`,
                { letterSpacing: 1.5 },
              ]}
            >
              FS
            </Text>
            <Text
              style={[
                tw`font-display text-[22px] text-mb-fg uppercase`,
                { letterSpacing: -0.5 },
              ]}
              numberOfLines={1}
            >
              Freestyle
            </Text>
          </Pressable>

          {/* New exercise affordance */}
          <Pressable
            onPress={handleNewExercise}
            style={({ pressed }) => [
              tw`flex-row items-center py-5`,
              pressed && tw`opacity-70`,
            ]}
          >
            <View style={tw`w-3`} />
            <Text
              style={[
                tw`font-mono text-[10px] text-mb-accent uppercase w-5`,
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
          tw`flex-row items-center border-t border-mb-line bg-mb-bg`,
          { paddingBottom: insets.bottom },
        ]}
      >
        {(
          [
            { label: "Scenes", target: "Scenes" },
            { label: "Music", target: "MusicControls" },
            { label: "Settings", target: "Settings" },
          ] as const
        ).map((b, i) => (
          <React.Fragment key={b.target}>
            {i > 0 ? (
              <Text
                style={tw`font-mono text-mb-accent text-[20px]`}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                ·
              </Text>
            ) : null}
            <Pressable
              onPress={() => navigation.navigate(b.target)}
              style={({ pressed }) => [
                tw`flex-1 items-center py-5`,
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
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};
