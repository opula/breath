import {keyBy} from 'lodash';
import uuid from 'react-native-uuid';
import {atom, mmkvStorage, selector, selectorFamily, update} from 'concordia';
import exercises from '../../assets/json/default-exercises-v4.json';
import {Exercise} from '../types/exercise';
import {storage} from '../utils/storage';
import {legacySlice} from './legacy';

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

// throttleMs: the whole library serializes on every write; dial commits in
// AdjustStep can burst, so bound it to one write per window (leading+trailing).
export const exercises$ = atom(
  'exercises',
  {...initialState, ...legacySlice<ExercisesState>('exercises')},
  {persist: {storage: mmkvStorage(storage), throttleMs: 500}},
);

export const resetExercises = update('exercises/reset', {e: exercises$}, d => {
  d.e.userExercises = defaultExercises;
});

export const updateExercises = update('exercises/updateAll', {e: exercises$},
  (d, list: Exercise[]) => {
    d.e.userExercises = list;
  });

export const updateExercise = update('exercises/update', {e: exercises$},
  (d, exercise: Exercise) => {
    const i = d.e.userExercises.findIndex((x: Exercise) => x.id === exercise.id);
    if (i >= 0) d.e.userExercises[i] = exercise;
  });

export const removeExercise = update('exercises/remove', {e: exercises$},
  (d, exerciseId: string) => {
    d.e.userExercises = d.e.userExercises.filter(
      (x: Exercise) => x.id !== exerciseId,
    );
  });

export const addExercise = update('exercises/add', {e: exercises$},
  (d, exerciseId: string) => {
    d.e.userExercises.push({
      id: exerciseId,
      name: 'New exercise',
      seq: [],
      loopable: true,
    } as Exercise);
  });

function stepOf(d: any, exerciseId: string, stepId: string) {
  const exercise = d.e.userExercises.find((x: Exercise) => x.id === exerciseId);
  return exercise?.seq.find((s: {id: string}) => s.id === stepId) ?? null;
}

export const updateExerciseStepValue = update('exercises/stepValue', {e: exercises$},
  (d, exerciseId: string, stepId: string, value: number[]) => {
    const step = stepOf(d, exerciseId, stepId);
    if (step) step.value = value;
  });

export const updateExerciseStepCount = update('exercises/stepCount', {e: exercises$},
  (d, exerciseId: string, stepId: string, count: number) => {
    const step = stepOf(d, exerciseId, stepId);
    if (step) step.count = count;
  });

export const updateExerciseStepText = update('exercises/stepText', {e: exercises$},
  (d, exerciseId: string, stepId: string, text: string) => {
    const step = stepOf(d, exerciseId, stepId);
    if (step) step.text = text;
  });

export const updateExerciseStepRamp = update('exercises/stepRamp', {e: exercises$},
  (d, exerciseId: string, stepId: string, ramp: number) => {
    const step = stepOf(d, exerciseId, stepId);
    if (step) step.ramp = ramp;
  });

export const addExerciseStep = update('exercises/addStep', {e: exercises$},
  (d, exerciseId: string, step: Exercise['seq'][number]) => {
    const exercise = d.e.userExercises.find((x: Exercise) => x.id === exerciseId);
    if (exercise) exercise.seq.push(step);
  });

export const editExerciseName = update('exercises/editName', {e: exercises$},
  (d, exerciseId: string, name: string) => {
    const exercise = d.e.userExercises.find((x: Exercise) => x.id === exerciseId);
    if (exercise) exercise.name = name;
  });

export const editExerciseDescription = update('exercises/editDescription', {e: exercises$},
  (d, exerciseId: string, description: string) => {
    const exercise = d.e.userExercises.find((x: Exercise) => x.id === exerciseId);
    if (exercise) exercise.description = description;
  });

// ---- derived ---------------------------------------------------------------

export const exercisesById$ = selector(exercises$.userExercises, list =>
  keyBy(list, 'id'),
);

export const exerciseById = selectorFamily((id: string) =>
  selector(exercisesById$, byId => byId[id]),
);

export const exerciseStepsById = selectorFamily((id: string) =>
  selector(exercisesById$, byId => byId[id]?.seq ?? []),
);

export const exerciseNameById = selectorFamily((id: string) =>
  selector(exercisesById$, byId => byId[id]?.name ?? ''),
);

export const exerciseDescriptionById = selectorFamily((id: string) =>
  selector(exercisesById$, byId => byId[id]?.description ?? ''),
);
