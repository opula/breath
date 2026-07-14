import {atom, mmkvStorage, update} from 'concordia';
import {storage} from '../utils/storage';
import {legacySlice} from './legacy';

interface LastPlayedState {
  exerciseId: string | null;
  lastPlayedAt: number | null;
}

const initialState: LastPlayedState = {
  exerciseId: null,
  lastPlayedAt: null,
};

export const lastPlayed$ = atom(
  'lastPlayed',
  {...initialState, ...legacySlice<LastPlayedState>('lastPlayed')},
  {persist: {storage: mmkvStorage(storage)}},
);

export const setLastPlayed = update('lastPlayed/set', {l: lastPlayed$},
  (d, exerciseId: string) => {
    d.l.exerciseId = exerciseId;
    d.l.lastPlayedAt = Date.now();
  });
