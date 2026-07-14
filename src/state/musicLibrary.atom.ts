import {sortBy} from 'lodash';
import {atom, mmkvStorage, selector, update} from 'concordia';
import {MusicFile} from '../types/music';
import {storage} from '../utils/storage';
import {legacySlice} from './legacy';

interface MusicLibraryState {
  files: MusicFile[];
  activeFileId: string | null;
}

const initialState: MusicLibraryState = {
  files: [],
  activeFileId: null,
};

export const musicLibrary$ = atom(
  'musicLibrary',
  {...initialState, ...legacySlice<MusicLibraryState>('musicLibrary')},
  {persist: {storage: mmkvStorage(storage)}},
);

export const addFile = update('musicLibrary/addFile', {m: musicLibrary$},
  (d, file: MusicFile) => {
    d.m.files.push(file);
  });

export const removeFile = update('musicLibrary/removeFile', {m: musicLibrary$},
  (d, id: string) => {
    d.m.files = d.m.files.filter((f: MusicFile) => f.id !== id);
    if (d.m.activeFileId === id) {
      d.m.activeFileId = null;
    }
  });

export const setActiveFile = update('musicLibrary/setActiveFile', {m: musicLibrary$},
  (d, id: string | null) => {
    d.m.activeFileId = id;
  });

export const sortedMusicFiles$ = selector(musicLibrary$.files, files =>
  sortBy(files, 'name'),
);

export const activeFile$ = selector(
  musicLibrary$.files, musicLibrary$.activeFileId,
  (files, activeId) => files.find(f => f.id === activeId) ?? null,
);
