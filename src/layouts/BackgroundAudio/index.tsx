import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationProp, RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { exerciseByIdSelector } from "../../state/exercises.selectors";
import { useParametrizedAppSelector } from "../../utils/selectors";
import { useBackgroundAudio } from "../../hooks/useBackgroundAudio";
import { calculateExerciseDuration } from "../../services/BackgroundAudio/exerciseEligibility";
import { convertSecondsToHHMM } from "../../utils/pretty";
import { HorizontalDial } from "../../components/HorizontalDial";
import tw from "../../utils/tw";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

const formatTime = (secs: number) => {
  const { minutes, seconds } = convertSecondsToHHMM(Math.floor(secs));
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const DialGroup = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <View style={tw`mt-5`}>
    <Text
      style={[
        tw`font-mono text-[9px] text-mb-mute uppercase mb-2`,
        { letterSpacing: 2 },
      ]}
    >
      · {label}
    </Text>
    {children}
  </View>
);

interface Props {
  navigation: NavigationProp<MainStackParams, "BackgroundAudio">;
  route: RouteProp<MainStackParams, "BackgroundAudio">;
}

export const BackgroundAudio = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets();
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
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  if (!exercise) return null;

  const showConfig = !isGenerating && !isGenerated;

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
            numberOfLines={1}
          >
            · background audio
          </Text>
          <View style={tw`w-10`} />
        </View>

        <View style={tw`flex-1 px-6`}>
          <Overline accent right={`${exercise.seq.length} phases`}>
            Render
          </Overline>
          <View style={tw`mt-5`}>
            <BigTitle size={36} accent>{exercise.name}</BigTitle>
          </View>

          {/* Config */}
          {showConfig && (
            <>
              <DialGroup label="Loops">
                <HorizontalDial
                  min={1}
                  max={maxLoops}
                  step={1}
                  suffix="×"
                  defaultValue={loops}
                  onChange={setLoops}
                />
              </DialGroup>
              <DialGroup label="Delay">
                <HorizontalDial
                  min={0}
                  max={60}
                  step={1}
                  suffix="s"
                  defaultValue={delay}
                  onChange={setDelay}
                />
              </DialGroup>
              <DialGroup label="Volume">
                <HorizontalDial
                  min={10}
                  max={200}
                  step={1}
                  suffix="%"
                  defaultValue={volume}
                  onChange={setVolume}
                />
              </DialGroup>

              {/* Total duration readout */}
              <View style={tw`mt-8 items-center`}>
                <Text
                  style={[
                    tw`font-mono text-[9px] text-mb-mute uppercase`,
                    { letterSpacing: 2 },
                  ]}
                >
                  · total
                </Text>
                <Text
                  style={[
                    tw`font-display text-[64px] text-mb-fg mt-2`,
                    {
                      letterSpacing: -2,
                      lineHeight: 64,
                      fontVariant: ["tabular-nums"],
                    },
                  ]}
                >
                  {durationDisplay}
                </Text>
              </View>

              <View style={tw`flex-1`} />

              <Text
                style={tw`font-inter text-xs text-mb-mute leading-relaxed my-6`}
              >
                Builds an audio track of this exercise that keeps playing even
                when you leave the app. Works alongside other audio.
              </Text>

              <Pressable
                onPress={handleGenerate}
                style={({ pressed }) => [
                  tw`border border-mb-accent py-4 items-center mb-4`,
                  pressed && tw`opacity-70`,
                ]}
              >
                <Text
                  style={[
                    tw`font-mono text-mb-accent uppercase text-[11px]`,
                    { letterSpacing: 3 },
                  ]}
                >
                  generate →
                </Text>
              </Pressable>
            </>
          )}

          {/* Generating */}
          {isGenerating && (
            <View style={tw`flex-1 justify-center items-center`}>
              <ActivityIndicator size="large" color="#6FE7FF" />
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute uppercase mt-4`,
                  { letterSpacing: 2 },
                ]}
              >
                · generating
              </Text>
            </View>
          )}

          {/* Player */}
          {isGenerated && !isGenerating && (
            <>
              <View style={tw`flex-1 justify-center items-center`}>
                <Pressable
                  onPress={handlePlayPause}
                  style={({ pressed }) => [
                    tw`w-32 h-32 rounded-full border border-mb-line-strong items-center justify-center`,
                    pressed && tw`opacity-70`,
                  ]}
                >
                  <Text
                    style={[
                      tw`font-display text-mb-accent uppercase`,
                      { fontSize: 24, letterSpacing: -0.5 },
                    ]}
                  >
                    {isPlaying ? "pause" : "play"}
                  </Text>
                </Pressable>
              </View>

              <View style={tw`mb-4`}>
                <View
                  style={tw`w-full h-[2px] bg-mb-line overflow-hidden`}
                >
                  <View
                    style={[
                      tw`h-full bg-mb-accent`,
                      { width: `${Math.min(progress * 100, 100)}%` },
                    ]}
                  />
                </View>
                <View style={tw`flex-row justify-between mt-2`}>
                  <Text
                    style={[
                      tw`font-mono text-[10px] text-mb-mute`,
                      { letterSpacing: 2, fontVariant: ["tabular-nums"] },
                    ]}
                  >
                    {formatTime(elapsedSeconds)}
                  </Text>
                  <Text
                    style={[
                      tw`font-mono text-[10px] text-mb-mute`,
                      { letterSpacing: 2, fontVariant: ["tabular-nums"] },
                    ]}
                  >
                    {formatTime(totalSeconds)}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={restart}
                style={({ pressed }) => [
                  tw`items-center py-4 mb-4`,
                  pressed && tw`opacity-70`,
                ]}
              >
                <Text
                  style={[
                    tw`font-mono text-mb-accent uppercase text-[10px]`,
                    { letterSpacing: 2 },
                  ]}
                >
                  · restart
                </Text>
              </Pressable>
            </>
          )}

          <View style={tw`items-center pb-4`}>
            <Text
              style={[
                tw`font-mono text-mb-dim uppercase text-[9px]`,
                { letterSpacing: 2 },
              ]}
            >
              · audio continues in the background
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};
