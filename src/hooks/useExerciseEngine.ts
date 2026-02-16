import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { useDebouncedCallback } from 'use-debounce';

import { ExerciseEngine } from '../services/ExerciseEngine';
import type {
  EngineState,
  ExerciseEngineCallbacks,
} from '../services/ExerciseEngine/types';
import { exerciseEmitter, Ops } from '../components/DynamicExercise/emitter';
import { exerciseScheduler } from '../services/ExerciseScheduler';
import { playExerciseSound } from '../services/ExerciseSounds';
import { soundsEnabledSelector } from '../state/configuration.selectors';
import { store } from '../store';
import { triggerHaptics } from '../utils/haptics';
import { LAST_EXERCISE, storage } from '../utils/storage';
import type { Exercise } from '../types/exercise';

interface UseExerciseEngineOptions {
  exercises: Exercise[];
  onPause?: (isPaused: boolean) => void;
}

export function useExerciseEngine({ exercises, onPause }: UseExerciseEngineOptions) {
  const [label, setLabel] = useState('');
  const [sublabel, setSublabel] = useState('');
  const [isBreathing, setBreathing] = useState(false);
  const [isText, setText] = useState(false);
  const [exerciseName, setExerciseName] = useState('');

  const iBreath = useSharedValue(0);
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;

  const debouncedClearName = useDebouncedCallback(() => {
    setExerciseName('');
  }, 2000);

  const showName = useCallback((name: string) => {
    setExerciseName(name);
    debouncedClearName();
  }, [debouncedClearName]);

  const engineRef = useRef<ExerciseEngine | null>(null);

  // Build engine once
  if (!engineRef.current) {
    const callbacks: ExerciseEngineCallbacks = {
      onStateChange(state: EngineState) {
        setLabel(state.label);
        setSublabel(state.sublabel);
        setBreathing(state.isBreathing);
        setText(state.isText);
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
    };

    engineRef.current = new ExerciseEngine(
      exercises,
      exerciseScheduler,
      callbacks,
      {
        getInitialExerciseIndex: () => storage.getNumber(LAST_EXERCISE) ?? 0,
        saveExerciseIndex: (index) => storage.set(LAST_EXERCISE, index),
        isSoundEnabled: () => soundsEnabledSelector(store.getState()),
      },
    );
  }

  const engine = engineRef.current;

  // Keep exercises in sync
  useEffect(() => {
    engine.updateExercises(exercises);
  }, [exercises, engine]);

  // Show name on mount + wire external GOTO_SEQUENCE events
  useEffect(() => {
    showName(engine.getExerciseName());

    const handleGoto = (index: number) => {
      engine.setExercise(index);
      showName(engine.getExerciseName());
    };
    exerciseEmitter.on(Ops.GOTO_SEQUENCE, handleGoto);

    return () => {
      exerciseEmitter.off(Ops.GOTO_SEQUENCE, handleGoto);
      engine.destroy();
    };
  }, [engine, showName]);

  const handleTap = useCallback(() => {
    const wasStarted = engine.isStarted();
    engine.advance();
    if (!wasStarted || !engine.isActive()) {
      showName(engine.getExerciseName());
    }
  }, [engine, showName]);

  const handleDoubleTap = useCallback(() => {
    engine.toggle();
    if (engine.isActive()) {
      showName(engine.getExerciseName());
    }
  }, [engine, showName]);

  const handleLongPress = useCallback(() => {
    engine.reset();
  }, [engine]);

  const handleNextExercise = useCallback(
    (delta: number) => {
      engine.nextExercise(delta);
      showName(engine.getExerciseName());
    },
    [engine, showName],
  );

  return {
    label,
    sublabel,
    isBreathing,
    isText,
    exerciseName,
    iBreath,
    handleTap,
    handleDoubleTap,
    handleLongPress,
    handleNextExercise,
  };
}
