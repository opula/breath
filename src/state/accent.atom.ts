import {atom, mmkvStorage, update} from 'concordia';
import {storage} from '../utils/storage';
import {legacySlice} from './legacy';

interface AccentState {
  color: string;
}

const initialState: AccentState = {
  color: '#6FE7FF',
};

export const accent$ = atom(
  'accent',
  {...initialState, ...legacySlice<AccentState>('accent')},
  {persist: {storage: mmkvStorage(storage)}},
);

export const setAccentColor = update('accent/setColor', {a: accent$},
  (d, color: string) => {
    d.a.color = color;
  });
