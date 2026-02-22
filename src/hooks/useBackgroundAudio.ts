import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  AudioBuffer,
  AudioContext,
  AudioManager,
  AudioBufferSourceNode,
  GainNode,
} from "react-native-audio-api";
import { Asset } from "expo-asset";
import { Exercise } from "../types/exercise";
import {
  buildPlaybackSchedule,
  PlaybackSchedule,
} from "../services/BackgroundAudio/renderExerciseAudio";
import { normalizeAudioBufferChannels } from "../services/BackgroundAudio/audioBufferUtils";
import { useNavigation } from "@react-navigation/native";

// Sound assets
const SOUND_ASSETS = {
  inhale: require("../../assets/sounds/inhale-sound.wav"),
  exhale: require("../../assets/sounds/exhale-sound.wav"),
  hold: require("../../assets/sounds/hold-sound-v2.wav"),
};

type MonoCues = {
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
  const monoCuesRef = useRef<MonoCues>({
    inhale: null,
    exhale: null,
    hold: null,
  });
  const scheduleRef = useRef<PlaybackSchedule | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const playStartTimeRef = useRef(0);
  const pausedOffsetRef = useRef(0);
  const isPlayingRef = useRef(false);
  const audioSessionConfigured = useRef(false);

  const navigation = useNavigation();

  // Configure audio session — called before any audio work
  const ensureAudioSession = useCallback(() => {
    if (audioSessionConfigured.current) return;
    AudioManager.setAudioSessionOptions({
      iosCategory: "playback",
      iosMode: "default",
      iosOptions: ["mixWithOthers"],
    });
    audioSessionConfigured.current = true;
  }, []);

  // Configure on mount as well
  useEffect(() => {
    ensureAudioSession();
  }, [ensureAudioSession]);

  // Decode sound assets and normalize to mono once
  const decodeSounds = useCallback(
    async (ctx: AudioContext) => {
      const entries = Object.entries(SOUND_ASSETS) as [
        keyof typeof SOUND_ASSETS,
        number,
      ][];

      for (const [key, asset] of entries) {
        if (monoCuesRef.current[key]) continue;

        try {
          const resolved = Asset.fromModule(asset);
          await resolved.downloadAsync();
          const localUri = resolved.localUri;
          if (!localUri) continue;

          const response = await fetch(localUri);
          const arrayBuffer = await response.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          // Normalize to mono once at decode time
          monoCuesRef.current[key] = normalizeAudioBufferChannels(
            decoded,
            1,
            ctx,
          );
        } catch (err) {
          console.warn(`Failed to decode sound "${key}":`, err);
        }
      }
    },
    [],
  );

  // Progress tracking
  const startProgressTimer = useCallback(() => {
    if (progressIntervalRef.current)
      clearInterval(progressIntervalRef.current);

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

  const getOrCreateContext = useCallback(() => {
    if (!audioContextRef.current) {
      ensureAudioSession();
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, [ensureAudioSession]);

  // Stop all active source nodes
  const stopAllSources = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    activeSourcesRef.current = [];
  }, []);

  // Schedule source nodes for all events from the given offset.
  // `now` is the shared ctx.currentTime snapshot used by the caller for
  // both scheduling and progress tracking, avoiding clock skew.
  const scheduleEvents = useCallback(
    (ctx: AudioContext, offset: number, now: number) => {
      const schedule = scheduleRef.current;
      const gain = gainNodeRef.current;
      if (!schedule || !gain) return;

      const baseTime = now - offset;

      for (const event of schedule.events) {
        // Skip events that have already passed
        if (event.time + event.duration <= offset) continue;

        const cueBuffer = monoCuesRef.current[event.cue as keyof MonoCues];
        if (!cueBuffer) continue;

        const source = ctx.createBufferSource();
        source.buffer = cueBuffer;
        source.connect(gain);

        const startAt = baseTime + event.time;
        const stopAt = baseTime + event.time + event.duration;

        if (startAt < now) {
          // Event is partially in the past — start from partway through
          const skipInto = now - startAt;
          source.start(0, skipInto);
        } else {
          source.start(startAt);
        }
        source.stop(stopAt);

        activeSourcesRef.current.push(source);
      }
    },
    [],
  );

  // Generate the playback schedule (no buffers!)
  const generate = useCallback(
    async (loops: number, gain: number, delay: number = 0) => {
      if (!exercise) return;
      setIsGenerating(true);

      try {
        const ctx = getOrCreateContext();
        await decodeSounds(ctx);

        const schedule = buildPlaybackSchedule(exercise, loops, delay);
        scheduleRef.current = schedule;

        // Create persistent gain node
        const gainNode = ctx.createGain();
        gainNode.gain.value = gain / 100;
        gainNode.connect(ctx.destination);
        gainNodeRef.current = gainNode;

        setTotalSeconds(schedule.totalDuration);
        setIsGenerated(true);
        setProgress(0);
        setElapsedSeconds(0);
        pausedOffsetRef.current = 0;
      } catch (err) {
        console.error("Failed to generate audio:", err);
      } finally {
        setIsGenerating(false);
      }
    },
    [exercise, getOrCreateContext, decodeSounds],
  );

  // Play from current offset
  const play = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !scheduleRef.current) return;

    // If we were at the end, restart
    if (pausedOffsetRef.current >= totalSeconds) {
      pausedOffsetRef.current = 0;
      setProgress(0);
      setElapsedSeconds(0);
    }

    stopAllSources();

    // Snapshot time once so scheduling and progress stay in sync
    const now = ctx.currentTime;
    scheduleEvents(ctx, pausedOffsetRef.current, now);
    playStartTimeRef.current = now;

    isPlayingRef.current = true;
    setIsPlaying(true);
    startProgressTimer();
  }, [totalSeconds, startProgressTimer, stopAllSources, scheduleEvents]);

  // Pause
  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const elapsed =
      ctx.currentTime - playStartTimeRef.current + pausedOffsetRef.current;
    pausedOffsetRef.current = elapsed;

    stopAllSources();
    isPlayingRef.current = false;
    setIsPlaying(false);

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, [stopAllSources]);

  // Restart from beginning
  const restart = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !scheduleRef.current) return;

    stopAllSources();

    pausedOffsetRef.current = 0;
    setProgress(0);
    setElapsedSeconds(0);

    // Snapshot time once so scheduling and progress stay in sync
    const now = ctx.currentTime;
    scheduleEvents(ctx, 0, now);
    playStartTimeRef.current = now;
    isPlayingRef.current = true;
    setIsPlaying(true);
    startProgressTimer();
  }, [startProgressTimer, stopAllSources, scheduleEvents]);

  // Teardown
  const teardown = useCallback(() => {
    stopAllSources();

    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch {}
      gainNodeRef.current = null;
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
    scheduleRef.current = null;
  }, [stopAllSources]);

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
