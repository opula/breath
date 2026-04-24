import {
  DEFAULT_BACKGROUND_SOURCE_ID,
  getBackgroundSourceIdByIndex,
  getBackgroundSourceIndexById,
  isSceneSourceId,
} from "../backgrounds/metadata";
import { RootState } from "../store";

export const isPausedSelector = (state: RootState) =>
  state.configuration.isPaused;

export const isGrayscaleSelector = (state: RootState) =>
  state.configuration.isGrayscale;

export const sourceIdSelector = (state: RootState) => {
  const sourceId = state.configuration.bgSourceId;
  if (isSceneSourceId(sourceId)) {
    return sourceId;
  }

  const legacyIndex = state.configuration.bgSourceIndex;
  return typeof legacyIndex === "number"
    ? getBackgroundSourceIdByIndex(legacyIndex)
    : DEFAULT_BACKGROUND_SOURCE_ID;
};

export const sourceIndexSelector = (state: RootState) =>
  getBackgroundSourceIndexById(sourceIdSelector(state));

export const soundsEnabledSelector = (state: RootState) =>
  state.configuration.soundsEnabled;

export const hapticsEnabledSelector = (state: RootState) =>
  state.configuration.hapticsEnabled;
