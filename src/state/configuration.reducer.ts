import {PayloadAction, createSlice} from '@reduxjs/toolkit';
import {reduxStorage} from '../storage';
import {PersistConfig, persistReducer} from 'redux-persist';
import {HAS_SEEN_TUTORIAL, storage} from '../utils/storage';

interface ConfigurationState {
  isPaused: boolean;
  isTutorial: boolean;
  isGrayscale: boolean;
  bgSourceIndex: number;
  soundsEnabled: boolean;
}

const initialState: ConfigurationState = {
  isPaused: true,
  isTutorial: false,
  isGrayscale: false,
  bgSourceIndex: 0,
  soundsEnabled: false,
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
    toggleTutorial(state) {
      state.isTutorial = !state.isTutorial;
    },
    engageTutorial(state) {
      state.isTutorial = true;
      state.isPaused = false;
    },
    engagePaused(state) {
      state.isTutorial = false;
      state.isPaused = true;
    },
    toggleGrayscale(state) {
      state.isGrayscale = !state.isGrayscale;
    },
    toggleSounds(state) {
      state.soundsEnabled = !state.soundsEnabled;
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
  toggleTutorial,
  toggleGrayscale,
  toggleSounds,
  updateSource,
  engagePaused,
  engageTutorial,
} = configurationSlice.actions;
