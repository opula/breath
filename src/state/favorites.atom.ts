import {atom, mmkvStorage, selector, selectorFamily, update} from 'concordia';
import {storage} from '../utils/storage';
import {legacySlice} from './legacy';

interface FavoritesState {
  ids: string[];
}

const initialState: FavoritesState = {ids: []};

export const favorites$ = atom(
  'favorites',
  {...initialState, ...legacySlice<FavoritesState>('favorites')},
  {persist: {storage: mmkvStorage(storage)}},
);

export const toggleFavorite = update('favorites/toggle', {f: favorites$},
  (d, id: string) => {
    const i = d.f.ids.indexOf(id);
    if (i >= 0) d.f.ids.splice(i, 1);
    else d.f.ids.push(id);
  });

export const isFavorite = selectorFamily((id: string) =>
  selector(favorites$.ids, ids => ids.includes(id)),
);
