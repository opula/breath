import {PayloadAction, createSlice} from '@reduxjs/toolkit';
import {reduxStorage} from '../storage';
import {PersistConfig, persistReducer} from 'redux-persist';
import {MusicFile} from '../types/music';

interface MusicLibraryState {
  files: MusicFile[];
  activeFileId: string | null;
}

const initialState: MusicLibraryState = {
  files: [],
  activeFileId: null,
};

export const musicLibrarySlice = createSlice({
  name: 'musicLibrary',
  initialState,
  reducers: {
    addFile(state, action: PayloadAction<MusicFile>) {
      state.files.push(action.payload);
    },
    removeFile(state, action: PayloadAction<string>) {
      state.files = state.files.filter(f => f.id !== action.payload);
      if (state.activeFileId === action.payload) {
        state.activeFileId = null;
      }
    },
    setActiveFile(state, action: PayloadAction<string | null>) {
      state.activeFileId = action.payload;
    },
  },
});

const persistConfig: PersistConfig<MusicLibraryState> = {
  key: 'musicLibrary',
  storage: reduxStorage,
};

export const musicLibraryReducer = persistReducer(
  persistConfig,
  musicLibrarySlice.reducer,
);

export const {addFile, removeFile, setActiveFile} =
  musicLibrarySlice.actions;
