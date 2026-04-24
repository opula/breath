import {PayloadAction, createSlice} from '@reduxjs/toolkit';
import {reduxStorage} from '../storage';
import {PersistConfig, persistReducer} from 'redux-persist';

interface LastPlayedState {
  exerciseId: string | null;
  lastPlayedAt: number | null;
}

const initialState: LastPlayedState = {
  exerciseId: null,
  lastPlayedAt: null,
};

export const lastPlayedSlice = createSlice({
  name: 'lastPlayed',
  initialState,
  reducers: {
    setLastPlayed(state, action: PayloadAction<string>) {
      state.exerciseId = action.payload;
      state.lastPlayedAt = Date.now();
    },
  },
});

const persistConfig: PersistConfig<LastPlayedState> = {
  key: 'lastPlayed',
  storage: reduxStorage,
};

export const lastPlayedReducer = persistReducer(
  persistConfig,
  lastPlayedSlice.reducer,
);
export const {setLastPlayed} = lastPlayedSlice.actions;
