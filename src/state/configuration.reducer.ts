import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { reduxStorage } from "../storage";
import { PersistConfig, persistReducer } from "redux-persist";
import type { PersistedState } from "redux-persist/es/types";
import {
  DEFAULT_BACKGROUND_SOURCE_ID,
  getBackgroundSourceIdByIndex,
  isSceneSourceId,
  type SceneSourceId,
} from "../backgrounds/metadata";

export type TimerProgressMode =
  | "always"
  | "minuteFade"
  | "endOn"
  | "endFade";

interface ConfigurationState {
  isPaused: boolean;
  isGrayscale: boolean;
  bgSourceId: SceneSourceId;
  soundsEnabled: boolean;
  hapticsEnabled: boolean;
  hideCenterHints: boolean;
  timerProgressMode: TimerProgressMode;
  bgSourceIndex?: number;
}

const initialState: ConfigurationState = {
  isPaused: true,
  isGrayscale: false,
  bgSourceId: DEFAULT_BACKGROUND_SOURCE_ID,
  soundsEnabled: true,
  hapticsEnabled: true,
  hideCenterHints: false,
  timerProgressMode: "always",
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
    toggleHideCenterHints(state) {
      state.hideCenterHints = !state.hideCenterHints;
    },
    setTimerProgressMode(state, action: PayloadAction<TimerProgressMode>) {
      state.timerProgressMode = action.payload;
    },
    updateSource(state, action: PayloadAction<SceneSourceId>) {
      state.bgSourceId = action.payload;
      delete state.bgSourceIndex;
    },
  },
});

type PersistedConfigurationState = PersistedState &
  Partial<ConfigurationState> & {
    bgSourceIndex?: number;
  };

const migrateConfigurationState = async (
  state: PersistedState,
): Promise<PersistedState> => {
  if (!state) {
    return state;
  }

  const migrated = { ...(state as PersistedConfigurationState) };

  if (!isSceneSourceId(migrated.bgSourceId)) {
    migrated.bgSourceId =
      typeof migrated.bgSourceIndex === "number"
        ? getBackgroundSourceIdByIndex(migrated.bgSourceIndex)
        : DEFAULT_BACKGROUND_SOURCE_ID;
  }

  delete migrated.bgSourceIndex;

  return migrated as PersistedState;
};

const persistConfig: PersistConfig<ConfigurationState> = {
  key: "configuration",
  storage: reduxStorage,
  blacklist: ["isPaused"],
  version: 1,
  migrate: migrateConfigurationState,
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
  toggleHideCenterHints,
  setTimerProgressMode,
  updateSource,
} = configurationSlice.actions;
