import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { AudioContext, AudioManager } from "react-native-audio-api";
import { Exercise } from "../types/exercise";
import { renderExerciseAudio } from "../services/BackgroundAudio/renderExerciseAudio";
import { applyGainWithSoftLimiting } from "../services/BackgroundAudio/audioBufferUtils";
import { useNavigation } from "@react-navigation/native";

// Sound assets
const SOUND_ASSETS = {
  inhale: require("../../assets/sounds/inhale-sound.wav"),
  exhale: require("../../assets/sounds/exhale-sound.wav"),
  hold: require("../../assets/sounds/hold-sound-v2.wav"),
};

type SoundCues = {
  inhale: AudioBuffer | null;
  exhale: AudioBuffer | null;
  hold: AudioBuffer | null;
};

export const useBackgroundAudio = (exercise: Exercise | undefined) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const renderedBufferRef = useRef<AudioBuffer | null>(null);
  const soundCuesRef = useRef<SoundCues>({
    inhale: null,
    exhale: null,
    hold: null,
  });
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const playStartTimeRef = useRef(0);
  const pausedOffsetRef = useRef(0);
  const isPlayingRef = useRef(false);

  const navigation = useNavigation();

  // Configure audio session on mount
  useEffect(() => {
    AudioManager.setAudioSessionOptions({
      iosCategory: "playback",
      iosMode: "default",
      iosOptions: ["mixWithOthers"],
    });
  }, []);

  // Decode sound assets
  const decodeSounds = useCallback(async (ctx: AudioContext) => {
    const entries = Object.entries(SOUND_ASSETS) as [
      keyof typeof SOUND_ASSETS,
      number,
    ][];

    for (const [key, asset] of entries) {
      if (soundCuesRef.current[key]) continue;

      // resolve the asset to a local URI
      const { localUri } = await (
        await import("expo-asset")
      ).Asset.fromModule(asset).downloadAsync();
      if (!localUri) continue;

      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();
      soundCuesRef.current[key] = await ctx.decodeAudioData(arrayBuffer);
    }
  }, []);

  // Progress tracking
  const startProgressTimer = useCallback(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    progressIntervalRef.current = setInterval(() => {
      const ctx = audioContextRef.current;
      if (!ctx || !isPlayingRef.current) return;

      const elapsed =
        ctx.currentTime - playStartTimeRef.current + pausedOffsetRef.current;
      const total = totalSeconds;
      const clampedElapsed = Math.min(elapsed, total);

      setElapsedSeconds(clampedElapsed);
      setProgress(total > 0 ? clampedElapsed / total : 0);

      if (elapsed >= total) {
        // Playback complete
        isPlayingRef.current = false;
        setIsPlaying(false);
        setProgress(1);
        setElapsedSeconds(total);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }
    }, 250);
  }, [totalSeconds]);

  // Handle app state changes to resume progress timer correctly
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active" && isPlayingRef.current) {
        startProgressTimer();
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [startProgressTimer]);

  const getOrCreateContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Generate the rendered buffer
  const generate = useCallback(
    async (loops: number, gain: number, delay: number = 0) => {
      if (!exercise) return;
      setIsGenerating(true);

      try {
        const ctx = await getOrCreateContext();
        await decodeSounds(ctx);

        const raw = renderExerciseAudio(
          exercise,
          loops,
          soundCuesRef.current,
          ctx,
          delay,
        );

        const gainValue = gain / 100;
        renderedBufferRef.current =
          gainValue !== 1
            ? applyGainWithSoftLimiting(raw, gainValue, ctx)
            : raw;

        const duration = renderedBufferRef.current.length / ctx.sampleRate;
        setTotalSeconds(duration);
        setIsGenerated(true);
        setProgress(0);
        setElapsedSeconds(0);
        pausedOffsetRef.current = 0;
      } finally {
        setIsGenerating(false);
      }
    },
    [exercise, getOrCreateContext, decodeSounds],
  );

  // Play from current offset
  const play = useCallback(async () => {
    const ctx = audioContextRef.current;
    const buffer = renderedBufferRef.current;
    if (!ctx || !buffer) return;

    // If we were at the end, restart
    if (pausedOffsetRef.current >= totalSeconds) {
      pausedOffsetRef.current = 0;
      setProgress(0);
      setElapsedSeconds(0);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0, pausedOffsetRef.current);

    sourceNodeRef.current = source;
    playStartTimeRef.current = ctx.currentTime;
    isPlayingRef.current = true;
    setIsPlaying(true);
    startProgressTimer();
  }, [totalSeconds, startProgressTimer]);

  // Pause
  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    const source = sourceNodeRef.current;
    if (!ctx || !source) return;

    const elapsed =
      ctx.currentTime - playStartTimeRef.current + pausedOffsetRef.current;
    pausedOffsetRef.current = elapsed;

    source.stop();
    source.disconnect();
    sourceNodeRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Restart from beginning
  const restart = useCallback(() => {
    const ctx = audioContextRef.current;
    const buffer = renderedBufferRef.current;
    if (!ctx || !buffer) return;

    // Stop current source
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    // Reset offset and start fresh
    pausedOffsetRef.current = 0;
    setProgress(0);
    setElapsedSeconds(0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0, 0);

    sourceNodeRef.current = source;
    playStartTimeRef.current = ctx.currentTime;
    isPlayingRef.current = true;
    setIsPlaying(true);
    startProgressTimer();
  }, [startProgressTimer]);

  // Teardown
  const teardown = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsGenerated(false);
    setProgress(0);
    setElapsedSeconds(0);
    renderedBufferRef.current = null;
  }, []);

  // Cleanup on unmount + beforeRemove nav event
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      teardown();
    });
    return () => {
      unsubscribe();
      teardown();
    };
  }, [navigation, teardown]);

  return {
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
    teardown,
  };
};
