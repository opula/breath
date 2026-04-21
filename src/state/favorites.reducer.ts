import {PayloadAction, createSlice} from '@reduxjs/toolkit';
import {reduxStorage} from '../storage';
import {PersistConfig, persistReducer} from 'redux-persist';

interface FavoritesState {
  ids: string[];
}

const initialState: FavoritesState = {
  ids: [],
};

export const favoritesSlice = createSlice({
  name: 'favorites',
  initialState,
  reducers: {
    toggleFavorite(state, action: PayloadAction<string>) {
      const id = action.payload;
      const i = state.ids.indexOf(id);
      if (i >= 0) state.ids.splice(i, 1);
      else state.ids.push(id);
    },
  },
});

const persistConfig: PersistConfig<FavoritesState> = {
  key: 'favorites',
  storage: reduxStorage,
};

export const favoritesReducer = persistReducer(
  persistConfig,
  favoritesSlice.reducer,
);
export const {toggleFavorite} = favoritesSlice.actions;
