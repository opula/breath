import {PayloadAction, createSlice} from '@reduxjs/toolkit';
import {reduxStorage} from '../storage';
import {PersistConfig, persistReducer} from 'redux-persist';

interface AccentState {
  color: string;
}

const initialState: AccentState = {
  color: '#6FE7FF',
};

export const accentSlice = createSlice({
  name: 'accent',
  initialState,
  reducers: {
    setAccentColor(state, action: PayloadAction<string>) {
      state.color = action.payload;
    },
  },
});

const persistConfig: PersistConfig<AccentState> = {
  key: 'accent',
  storage: reduxStorage,
};

export const accentReducer = persistReducer(persistConfig, accentSlice.reducer);
export const {setAccentColor} = accentSlice.actions;
