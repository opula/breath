import {RootState} from '../store';

export const lastPlayedExerciseIdSelector = (state: RootState) =>
  state.lastPlayed.exerciseId;
