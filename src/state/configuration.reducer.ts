import {PayloadAction, createSlice} from '@reduxjs/toolkit';
import {reduxStorage} from '../storage';
import {PersistConfig, persistReducer} from 'redux-persist';
interface ConfigurationState {
  isPaused: boolean;
  isGrayscale: boolean;
  bgSourceIndex: number;
  soundsEnabled: boolean;
  hapticsEnabled: boolean;
}

const initialState: ConfigurationState = {
  isPaused: true,
  isGrayscale: false,
  bgSourceIndex: 12,
  soundsEnabled: true,
  hapticsEnabled: true,
};

export const configurationSlice = createSlice({
  name: 'configuration',
  initialState,
  reducers: {
    setPause(state, action: PayloadAction<boolean>) {
      state.isPaused = action.payload;
    },
    togglePaused(state) {
      state.isPaused = !state.isPaused;
    },
    toggleGrayscale(state) {
      state.isGrayscale = !state.isGrayscale;
    },
    toggleSounds(state) {
      state.soundsEnabled = !state.soundsEnabled;
    },
    toggleHaptics(state) {
      state.hapticsEnabled = !state.hapticsEnabled;
    },
    updateSource(state, action: PayloadAction<number>) {
      state.bgSourceIndex = action.payload;
    },
  },
});

const persistConfig: PersistConfig<ConfigurationState> = {
  key: 'configuration',
  storage: reduxStorage,
  blacklist: ['isPaused'],
};

export const configurationReducer = persistReducer(
  persistConfig,
  configurationSlice.reducer,
);
export const {
  setPause,
  togglePaused,
  toggleGrayscale,
  toggleSounds,
  toggleHaptics,
  updateSource,
} = configurationSlice.actions;
