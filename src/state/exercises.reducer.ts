import {PayloadAction, createSlice} from '@reduxjs/toolkit';
import exercises from '../../assets/json/default-exercises-v3.json';
import uuid from 'react-native-uuid';
import {Exercise} from '../types/exercise';
import {reduxStorage} from '../storage';
import {persistReducer} from 'redux-persist';

const defaultExercises = exercises.map(exercise => ({
  ...exercise,
  id: uuid.v4() as string,
  seq: exercise.seq.map(item => ({
    ...item,
    id: uuid.v4() as string,
  })),
})) as Exercise[];

interface ExercisesState {
  userExercises: Exercise[];
}

const initialState: ExercisesState = {
  userExercises: defaultExercises,
};

export const exercisesSlice = createSlice({
  name: 'exercises',
  initialState,
  reducers: {
    resetExercises(state) {
      state.userExercises = defaultExercises;
    },
    updateExercises(state, action: PayloadAction<{exercises: Exercise[]}>) {
      state.userExercises = action.payload.exercises;
    },
    updateExercise(state, action: PayloadAction<{exercise: Exercise}>) {
      const updatedExercise = action.payload.exercise;

      state.userExercises = state.userExercises.map(exercise =>
        exercise.id !== updatedExercise.id ? exercise : updatedExercise,
      );
    },
    updateExerciseStepValue(
      state,
      action: PayloadAction<{
        exerciseId: string;
        stepId: string;
        value: number[];
      }>,
    ) {
      const {exerciseId, stepId, value} = action.payload;
      state.userExercises = state.userExercises.map(exercise =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              seq: exercise.seq.map(step =>
                step.id !== stepId
                  ? step
                  : {
                      ...step,
                      value,
                    },
              ),
            },
      );
    },
    updateExerciseStepCount(
      state,
      action: PayloadAction<{
        exerciseId: string;
        stepId: string;
        count: number;
      }>,
    ) {
      const {exerciseId, stepId, count} = action.payload;
      state.userExercises = state.userExercises.map(exercise =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              seq: exercise.seq.map(step =>
                step.id !== stepId
                  ? step
                  : {
                      ...step,
                      count,
                    },
              ),
            },
      );
    },
    updateExerciseStepText(
      state,
      action: PayloadAction<{
        exerciseId: string;
        stepId: string;
        text: string;
      }>,
    ) {
      const {exerciseId, stepId, text} = action.payload;
      state.userExercises = state.userExercises.map(exercise =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              seq: exercise.seq.map(step =>
                step.id !== stepId
                  ? step
                  : {
                      ...step,
                      text,
                    },
              ),
            },
      );
    },
    updateExerciseStepRamp(
      state,
      action: PayloadAction<{
        exerciseId: string;
        stepId: string;
        ramp: number;
      }>,
    ) {
      const {exerciseId, stepId, ramp} = action.payload;
      state.userExercises = state.userExercises.map(exercise =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              seq: exercise.seq.map(step =>
                step.id !== stepId
                  ? step
                  : {
                      ...step,
                      ramp,
                    },
              ),
            },
      );
    },
    editExerciseName(
      state,
      action: PayloadAction<{
        exerciseId: string;
        name: string;
      }>,
    ) {
      const {exerciseId, name} = action.payload;
      state.userExercises = state.userExercises.map(exercise =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              name,
            },
      );
    },
    addExerciseStep(
      state,
      action: PayloadAction<{
        exerciseId: string;
        step: Exercise['seq'][number];
      }>,
    ) {
      const {exerciseId, step} = action.payload;
      state.userExercises = state.userExercises.map(exercise =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              seq: [...exercise.seq, step],
            },
      );
    },
    removeExercise(
      state,
      action: PayloadAction<{exerciseId: string}>,
    ) {
      state.userExercises = state.userExercises.filter(
        exercise => exercise.id !== action.payload.exerciseId,
      );
    },
    addExercise(
      state,
      action: PayloadAction<{
        exerciseId: string;
      }>,
    ) {
      const {exerciseId} = action.payload;
      state.userExercises = [
        ...state.userExercises,
        {
          id: exerciseId,
          name: 'New exercise',
          seq: [],
          loopable: true,
        },
      ];
    },
  },
});

const persistConfig = {
  key: 'exercises',
  storage: reduxStorage,
};

export const exercisesReducer = persistReducer(
  persistConfig,
  exercisesSlice.reducer,
);

export const {
  resetExercises,
  updateExercises,
  updateExercise,
  removeExercise,
  updateExerciseStepValue,
  updateExerciseStepCount,
  updateExerciseStepRamp,
  updateExerciseStepText,
  editExerciseName,
  addExerciseStep,
  addExercise,
} = exercisesSlice.actions;
