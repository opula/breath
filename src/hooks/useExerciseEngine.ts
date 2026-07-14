import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { ExerciseEngine } from '../services/ExerciseEngine';
import type { ExerciseEngineCallbacks } from '../services/ExerciseEngine/types';
import { exerciseEmitter, Ops } from '../components/DynamicExercise/emitter';
import { exerciseScheduler } from '../services/ExerciseScheduler';
import { playExerciseSound } from '../services/ExerciseSounds';
import { configuration$ } from '../state/configuration.atom';
import {
  clearEngineDisplay,
  setEngineDisplay,
  setRepeatProgress,
} from '../state/session.atom';
import { triggerHaptics } from '../utils/haptics';
import { LAST_EXERCISE, storage } from '../utils/storage';
import type { Exercise } from '../types/exercise';

interface UseExerciseEngineOptions {
  exercises: Exercise[];
  onPause?: (isPaused: boolean) => void;
}

export function useExerciseEngine({ exercises, onPause }: UseExerciseEngineOptions) {
  const [isStarted, setStarted] = useState(false);
  const [exerciseName, setExerciseName] = useState('');

  const iBreath = useSharedValue(0);
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;

  const showName = useCallback((name: string) => {
    setExerciseName(name);
  }, []);

  const engineRef = useRef<ExerciseEngine | null>(null);

  // Build engine once
  if (!engineRef.current) {
    const callbacks: ExerciseEngineCallbacks = {
      // Display state goes to the session atom, not React state: per-second
      // countdown ticks then re-render only the leaves that subscribe to the
      // changed path, never the hosting screen.
      onStateChange(state) {
        setEngineDisplay(state);
      },
      onPlaySound(type) {
        playExerciseSound(type);
      },
      onVibrate(pattern) {
        Vibration.vibrate(pattern as any);
      },
      onAnimateBreath(target, durationSec) {
        iBreath.value = withTiming(target, { duration: durationSec * 1000 });
      },
      onHaptic() {
        triggerHaptics();
      },
      onPauseChange(isPaused) {
        onPauseRef.current?.(isPaused);
      },
      onRepeatChange(info) {
        setRepeatProgress(info);
      },
    };

    engineRef.current = new ExerciseEngine(
      exercises,
      exerciseScheduler,
      callbacks,
      {
        getInitialExerciseIndex: () => storage.getNumber(LAST_EXERCISE) ?? 0,
        saveExerciseIndex: (index) => storage.set(LAST_EXERCISE, index),
        isSoundEnabled: () => configuration$.soundsEnabled.peek(),
        isHapticsEnabled: () => configuration$.hapticsEnabled.peek(),
      },
    );
  }

  const engine = engineRef.current;

  // Keep exercises in sync
  useEffect(() => {
    engine.updateExercises(exercises);
  }, [exercises, engine]);

  // Pause engine when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && engine.isActive()) {
        engine.pause();
      }
    });
    return () => sub.remove();
  }, [engine]);

  // Show name on mount + wire external GOTO_SEQUENCE events
  useEffect(() => {
    showName(engine.getExerciseName());

    const handleGoto = (index: number) => {
      engine.setExercise(index);
      setStarted(engine.isStarted());
      showName(engine.getExerciseName());
    };
    exerciseEmitter.on(Ops.GOTO_SEQUENCE, handleGoto);

    return () => {
      exerciseEmitter.off(Ops.GOTO_SEQUENCE, handleGoto);
      engine.destroy();
      clearEngineDisplay();
      onPauseRef.current?.(true);
    };
  }, [engine, showName]);

  const handleStart = useCallback(() => {
    if (engine.isStarted()) return;
    engine.advance();
    setStarted(engine.isStarted());
    showName(engine.getExerciseName());
  }, [engine, showName]);

  const handleTap = useCallback(() => {
    if (!engine.isStarted()) return;
    engine.advance();
    setStarted(engine.isStarted());
    if (!engine.isActive()) {
      showName(engine.getExerciseName());
    }
  }, [engine, showName]);

  const handlePauseResume = useCallback(() => {
    if (!engine.isStarted()) return;
    engine.toggle();
    setStarted(engine.isStarted());
    showName(engine.getExerciseName());
  }, [engine, showName]);

  const handleLongPress = useCallback(() => {
    if (!engine.isStarted()) return;
    engine.reset();
    setStarted(engine.isStarted());
    showName(engine.getExerciseName());
  }, [engine, showName]);

  const handleStop = useCallback(() => {
    engine.stop();
    setStarted(engine.isStarted());
  }, [engine]);

  const handleNextExercise = useCallback(
    (delta: number) => {
      if (engine.isActive()) return;
      engine.nextExercise(delta);
      setStarted(engine.isStarted());
      showName(engine.getExerciseName());
    },
    [engine, showName],
  );

  return {
    isStarted,
    exerciseName,
    iBreath,
    handleStart,
    handleTap,
    handlePauseResume,
    handleLongPress,
    handleStop,
    handleNextExercise,
  };
}
