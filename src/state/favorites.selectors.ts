import {RootState} from '../store';

export const favoritesSelector = (state: RootState) => state.favorites.ids;

export const isFavoriteSelector =
  (id: string) =>
  (state: RootState): boolean =>
    state.favorites.ids.includes(id);
