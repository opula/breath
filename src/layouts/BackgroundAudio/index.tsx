import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProp, RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { exerciseByIdSelector } from "../../state/exercises.selectors";
import { useParametrizedAppSelector } from "../../utils/selectors";
import { useBackgroundAudio } from "../../hooks/useBackgroundAudio";
import { calculateExerciseDuration } from "../../services/BackgroundAudio/exerciseEligibility";
import { convertSecondsToHHMM } from "../../utils/pretty";
import { HorizontalDial } from "../../components/HorizontalDial";
import { Icon } from "../../components/Icon";
import tw from "../../utils/tw";

const formatTime = (secs: number) => {
  const { minutes, seconds } = convertSecondsToHHMM(Math.floor(secs));
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

interface Props {
  navigation: NavigationProp<MainStackParams, "BackgroundAudio">;
  route: RouteProp<MainStackParams, "BackgroundAudio">;
}

export const BackgroundAudio = ({ navigation, route }: Props) => {
  const exercise = useParametrizedAppSelector(
    exerciseByIdSelector,
    route.params.id,
  );

  const [loops, setLoops] = useState(3);
  const [delay, setDelay] = useState(0);
  const [volume, setVolume] = useState(100);

  const {
    isGenerating,
    isGenerated,
    isPlaying,
    progress,
    elapsedSeconds,
    totalSeconds,
    generate,
    play,
    pause,
    restart,
  } = useBackgroundAudio(exercise);

  const singleLoopSeconds = useMemo(
    () => (exercise ? calculateExerciseDuration(exercise, 1) : 1),
    [exercise],
  );

  const maxLoops = useMemo(
    () => Math.max(1, Math.ceil(3600 / singleLoopSeconds)),
    [singleLoopSeconds],
  );

  const durationSeconds = useMemo(
    () => (exercise ? calculateExerciseDuration(exercise, loops) + delay : 0),
    [exercise, loops, delay],
  );

  const durationDisplay = useMemo(
    () => formatTime(durationSeconds),
    [durationSeconds],
  );

  const handleGenerate = useCallback(() => {
    generate(loops, volume, delay);
  }, [generate, loops, volume, delay]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  if (!exercise) return null;

  const showConfig = !isGenerating && !isGenerated;

  return (
    <View style={tw`flex-1 bg-black`}>
      <SafeAreaView style={tw`flex-1 px-4`}>
        {/* Header */}
        <View
          style={tw`flex-row px-0 pb-2 justify-between items-center border-b border-neutral-800`}
        >
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={20} color="white" />
          </Pressable>
          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200`}
            numberOfLines={1}
          >
            {exercise.name}
          </Text>
          <View style={tw`h-10 w-10`} />
        </View>

        <View style={tw`flex-1`}>
          {/* Config — hidden once generating/generated */}
          {showConfig && (
            <>
              <View style={tw`mt-8 pl-4`}>
                <Text style={tw`text-xs font-inter text-neutral-500 mb-2`}>
                  Loops
                </Text>
                <HorizontalDial
                  min={1}
                  max={maxLoops}
                  step={1}
                  suffix="x"
                  defaultValue={loops}
                  onChange={setLoops}
                />
              </View>

              <View style={tw`mt-6 pl-4`}>
                <Text style={tw`text-xs font-inter text-neutral-500 mb-2`}>
                  Delay
                </Text>
                <HorizontalDial
                  min={0}
                  max={60}
                  step={1}
                  suffix="sec"
                  defaultValue={delay}
                  onChange={setDelay}
                />
              </View>

              <View style={tw`mt-6 pl-4`}>
                <Text style={tw`text-xs font-inter text-neutral-500 mb-2`}>
                  Volume
                </Text>
                <HorizontalDial
                  min={10}
                  max={200}
                  step={1}
                  suffix="%"
                  defaultValue={volume}
                  onChange={setVolume}
                />
              </View>

              <View style={tw`mt-12 items-center`}>
                <Text
                  style={[
                    tw`text-3xl font-inter text-white`,
                    { fontVariant: ["tabular-nums"] },
                  ]}
                >
                  {durationDisplay}
                </Text>
                <Text style={tw`text-xs font-inter text-neutral-500 mt-1`}>
                  Total time
                </Text>
              </View>

              <View style={tw`flex-1`} />

              <Text style={tw`text-sm font-inter text-neutral-400 px-2 mb-6`}>
                Creates an audio version of this exercise that keeps playing
                even when you leave the app. Works alongside other audio.
              </Text>

              <Pressable
                style={tw`bg-white bg-opacity-10 rounded-full py-3 items-center active:opacity-80 mb-4`}
                onPress={handleGenerate}
              >
                <Text style={tw`text-sm font-inter text-white font-medium`}>
                  Generate
                </Text>
              </Pressable>
            </>
          )}

          {/* Generating */}
          {isGenerating && (
            <View style={tw`flex-1 justify-center items-center`}>
              <ActivityIndicator size="large" color="white" />
              <Text style={tw`text-xs font-inter text-neutral-500 mt-3`}>
                Generating...
              </Text>
            </View>
          )}

          {/* Player */}
          {isGenerated && !isGenerating && (
            <>
              {/* Centered play/pause */}
              <View style={tw`flex-1 justify-center items-center`}>
                <Pressable
                  style={tw`active:opacity-80`}
                  onPress={handlePlayPause}
                >
                  <Icon
                    name={isPlaying ? "pause-circle" : "play-circle"}
                    size={72}
                    color="white"
                  />
                </Pressable>
              </View>

              {/* Progress */}
              <View style={tw`px-2 mb-2`}>
                <View
                  style={tw`w-full h-1 bg-white bg-opacity-10 rounded-full overflow-hidden`}
                >
                  <View
                    style={[
                      tw`h-full bg-white rounded-full`,
                      { width: `${Math.min(progress * 100, 100)}%` },
                    ]}
                  />
                </View>
                <View style={tw`flex-row justify-between mt-1`}>
                  <Text
                    style={[
                      tw`text-[10px] font-inter text-neutral-500`,
                      { fontVariant: ["tabular-nums"] },
                    ]}
                  >
                    {formatTime(elapsedSeconds)}
                  </Text>
                  <Text
                    style={[
                      tw`text-[10px] font-inter text-neutral-500`,
                      { fontVariant: ["tabular-nums"] },
                    ]}
                  >
                    {formatTime(totalSeconds)}
                  </Text>
                </View>
              </View>

              {/* Restart */}
              <Pressable
                style={tw`items-center py-3 active:opacity-80 mb-2`}
                onPress={restart}
              >
                <Text style={[tw`text-xs font-inter`, { color: "#6FE7FF" }]}>
                  Restart
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Footer */}
        <View style={tw`items-center pb-2`}>
          <Text style={tw`text-[10px] font-inter text-neutral-600`}>
            Audio will continue in the background
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
};
