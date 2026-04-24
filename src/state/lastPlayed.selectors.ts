import {RootState} from '../store';

export const lastPlayedExerciseIdSelector = (state: RootState) =>
  state.lastPlayed.exerciseId;

export const lastPlayedAtSelector = (state: RootState) =>
  state.lastPlayed.lastPlayedAt;
