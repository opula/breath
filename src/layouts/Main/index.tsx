import { useKeepAwake } from "expo-keep-awake";
import React, { useCallback } from "react";
import { Platform, View } from "react-native";
import { DynamicExercise } from "../../components/DynamicExercise";

import { Icon } from "../../components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import { Pressable } from "react-native";
import tw from "../../utils/tw";
import {
  NavigationProp,
  useIsFocused,
  useNavigation,
} from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Tutorial } from "./Tutorial";
import { Background } from "./Background";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  isPausedSelector,
  isTutorialSelector,
  sourceIndexSelector,
} from "../../state/configuration.selectors";
import {
  toggleGrayscale as toggleGrayscaleAction,
  togglePaused as togglePausedAction,
  setPause as setPauseAction,
  updateSource as updateSourceAction,
  engagePaused as engagePausedAction,
  engageTutorial as engageTutorialAction,
} from "../../state/configuration.reducer";
import { getSelectorSnapshot } from "../../utils/selectors";
import { TOTAL_BACKGROUNDS } from "./sources";

export const Main = () => {
  useKeepAwake();
  const navigation = useNavigation<NavigationProp<MainStackParams, "Main">>();
  const dispatch = useAppDispatch();
  const isFocused = useIsFocused();
  const { top, left } = useSafeAreaInsets();
  const osTop = top + (Platform.OS === "android" ? 16 : 0);

  const isPaused = useAppSelector(isPausedSelector);
  const isTutorial = useAppSelector(isTutorialSelector);

  const changeSource = useCallback(
    (direction: number) => {
      const sourceIndex = getSelectorSnapshot(sourceIndexSelector);
      const nextIndex = (sourceIndex + direction) % TOTAL_BACKGROUNDS;
      const newSourceIndex = nextIndex > -1 ? nextIndex : TOTAL_BACKGROUNDS - 1;
      dispatch(updateSourceAction(newSourceIndex));
    },
    [dispatch],
  );
  const togglePaused = useCallback(
    () => dispatch(togglePausedAction()),
    [dispatch],
  );
  const setPause = useCallback(
    (status: boolean) => dispatch(setPauseAction(status)),
    [dispatch],
  );
  const toggleGrayscale = useCallback(
    () => dispatch(toggleGrayscaleAction()),
    [dispatch],
  );
  const engagePaused = useCallback(() => dispatch(engagePausedAction()), []);
  const engageTutorial = useCallback(
    () => dispatch(engageTutorialAction()),
    [],
  );

  return (
    <>
      <View style={tw`flex-1 bg-black`}>
        {/* <AnimatePresence>{isFocused ? <Background /> : null}</AnimatePresence> */}
        <AnimatePresence>
          <Background />
        </AnimatePresence>
      </View>

      <AnimatePresence>
        {isPaused || isTutorial ? (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: isTutorial ? 0.75 : 0.45 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
            style={tw`absolute inset-0 bg-black`}
            pointerEvents="none"
          />
        ) : null}
      </AnimatePresence>

      <View style={[tw`absolute inset-0`, { opacity: isTutorial ? 0 : 1 }]}>
        <DynamicExercise onChangeSource={changeSource} onPause={setPause} />
      </View>

      <AnimatePresence>
        {isPaused && isFocused ? (
          <MotiView
            key="left"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
            style={[
              tw`absolute`,
              {
                left: Math.max(left, 16),
                top: Math.max(osTop, 16),
              },
            ]}
          >
            <Pressable
              style={tw`h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={toggleGrayscale}
            >
              <Icon name="moon" size={24} color="white" />
            </Pressable>
            <Pressable
              style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={() => {
                navigation.navigate("MusicControls");
              }}
            >
              <Icon name="headphones" size={24} color="white" />
            </Pressable>
            <Pressable
              style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={engageTutorial}
            >
              <Icon name="help" size={24} color="white" />
            </Pressable>
          </MotiView>
        ) : null}

        {isPaused && isFocused ? (
          <MotiView
            key="right"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
            style={[
              tw`absolute`,
              {
                right: Math.max(left, 16),
                top: Math.max(osTop, 16),
              },
            ]}
          >
            <Pressable
              style={tw`h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={() => {
                navigation.navigate("ExercisesList");
              }}
            >
              <Icon name="unordered-list" size={24} color="white" />
            </Pressable>
          </MotiView>
        ) : null}

        {isTutorial ? <Tutorial onClose={engagePaused} /> : null}
      </AnimatePresence>
    </>
  );
};
