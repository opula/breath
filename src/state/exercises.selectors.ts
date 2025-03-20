import {createSelector} from '@reduxjs/toolkit';
import {RootState} from '../store';
import {flattenDeep, keyBy} from 'lodash';
import {Exercise} from '../types/exercise';

export const exercisesSelector = (state: RootState) =>
  state.exercises.userExercises;

export const exercisesByIdSelector = createSelector(
  exercisesSelector,
  exercises => keyBy(exercises, 'id'),
);

export const exerciseByIdSelector = (state: RootState, id: string) =>
  exercisesByIdSelector(state)[id];

export const exerciseStepsByIdSelector = createSelector(
  exercisesByIdSelector,
  (_, id) => id,
  (exercisesIndex: Record<string, Exercise>, id: string) => {
    const exercise = exercisesIndex[id];
    return exercise.seq;
  },
);

export const exerciseNameByIdSelector = createSelector(
  exercisesByIdSelector,
  (_, id) => id,
  (exercisesIndex: Record<string, Exercise>, id: string) => {
    const exercise = exercisesIndex[id];
    return exercise.name;
  },
);
