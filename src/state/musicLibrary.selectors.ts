import {createSelector} from '@reduxjs/toolkit';
import {RootState} from '../store';
import { sortBy } from 'lodash';

export const musicFilesSelector = (state: RootState) =>
  state.musicLibrary.files;

export const sortedMusicFilesSelector = createSelector(musicFilesSelector, (files) => sortBy(files, 'name'))

export const activeFileIdSelector = (state: RootState) =>
  state.musicLibrary.activeFileId;

export const activeFileSelector = createSelector(
  [musicFilesSelector, activeFileIdSelector],
  (files, activeId) => files.find(f => f.id === activeId) ?? null,
);
