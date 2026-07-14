import {atom, selector, update} from 'concordia';
import type {EngineState} from '../services/ExerciseEngine/types';

export interface RepeatProgress {
  round: number;
  total: number;
}

interface SessionState extends EngineState {
  /** Whole seconds since session start (pausable). Written by usePausableClock. */
  elapsedSeconds: number;
  repeatProgress: RepeatProgress | null;
}

const initialState: SessionState = {
  elapsedSeconds: 0,
  label: '',
  sublabel: '',
  isBreathing: false,
  isText: false,
  isHIE: false,
  canAdvance: false,
  repeatProgress: null,
};

/**
 * Live-session display state. Deliberately unpersisted: this atom churns at
 * up to 1 Hz (clock seconds, countdown sublabels), which must never hit the
 * persistence write-through path. Consumers subscribe per-path so a sublabel
 * tick re-renders only the leaf that shows it.
 */
export const session$ = atom('session', initialState);

export const setSessionElapsedSeconds = update('session/setElapsedSeconds', {s: session$},
  (d, seconds: number) => {
    d.s.elapsedSeconds = seconds;
  });

export const setEngineDisplay = update('session/engineDisplay', {s: session$},
  (d, state: EngineState) => {
    d.s.label = state.label;
    d.s.sublabel = state.sublabel;
    d.s.isBreathing = state.isBreathing;
    d.s.isText = state.isText;
    d.s.isHIE = state.isHIE;
    d.s.canAdvance = state.canAdvance;
  });

export const setRepeatProgress = update('session/repeatProgress', {s: session$},
  (d, info: RepeatProgress | null) => {
    const current = d.s.repeatProgress;
    if (current?.round === info?.round && current?.total === info?.total) return;
    d.s.repeatProgress = info;
  });

/** Engine unmount cleanup — a fresh session must never flash stale labels. */
export const clearEngineDisplay = (): void => {
  setEngineDisplay({
    label: '',
    sublabel: '',
    isBreathing: false,
    isText: false,
    isHIE: false,
    canAdvance: false,
  });
  setRepeatProgress(null);
};

export const sessionClockText$ = selector(session$.elapsedSeconds, elapsed => {
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
});
