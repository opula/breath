import {RootState} from '../store';

export const isPausedSelector = (state: RootState) =>
  state.configuration.isPaused;

export const isTutorialSelector = (state: RootState) =>
  state.configuration.isTutorial;

export const isGrayscaleSelector = (state: RootState) =>
  state.configuration.isGrayscale;

export const sourceIndexSelector = (state: RootState) =>
  state.configuration.bgSourceIndex;

export const soundsEnabledSelector = (state: RootState) =>
  state.configuration.soundsEnabled;

export const hapticsEnabledSelector = (state: RootState) =>
  state.configuration.hapticsEnabled;
