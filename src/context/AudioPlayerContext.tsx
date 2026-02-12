import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  useAudioPlayer as useExpoAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import uuid from 'react-native-uuid';
import {useSelector, useDispatch} from 'react-redux';
import {
  storage,
  MUSIC_BG_VOLUME,
  LEGACY_MUSIC_FILE_URI,
  LEGACY_MUSIC_FILE_NAME,
} from '../utils/storage';
import {
  addFile,
  removeFile,
  setActiveFile,
} from '../state/musicLibrary.reducer';
import {
  activeFileSelector,
  activeFileIdSelector,
} from '../state/musicLibrary.selectors';
import {
  copyToMusicDir,
  downloadToMusicDir,
  deleteFromMusicDir,
  getMusicFileUri,
} from '../utils/musicFiles';
import {store} from '../store';
import {MusicFile} from '../types/music';

function getInitialSource(): {uri: string} | undefined {
  const state = store.getState();
  const active = activeFileSelector(state);
  if (active) {
    return {uri: getMusicFileUri(active.fileName)};
  }
  // Fall back to legacy MMKV key for first launch after upgrade
  const legacyUri = storage.getString(LEGACY_MUSIC_FILE_URI);
  if (legacyUri) {
    return {uri: legacyUri};
  }
  return undefined;
}

interface AudioPlayerState {
  isPlaying: boolean;
  isLoaded: boolean;
  volume: number;
  activeFileName: string | null;
  isDownloading: boolean;
}

interface AudioPlayerActions {
  play: () => void;
  pause: () => void;
  setVolume: (v: number) => void;
  setLiveVolume: (v: number) => void;
  pickLocalFile: () => Promise<void>;
  pasteUrl: () => Promise<void>;
  playFile: (id: string) => void;
  deleteFile: (id: string) => void;
}

const AudioPlayerContext = createContext<
  (AudioPlayerState & AudioPlayerActions) | undefined
>(undefined);

export const AudioPlayerProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const dispatch = useDispatch();
  const activeFile = useSelector(activeFileSelector);
  const activeFileId = useSelector(activeFileIdSelector);
  const savedVolume = storage.getNumber(MUSIC_BG_VOLUME) ?? 1;
  const migrated = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const player = useExpoAudioPlayer(getInitialSource());
  const status = useAudioPlayerStatus(player);

  // Configure audio mode on mount
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  }, []);

  // Set loop and initial volume
  useEffect(() => {
    player.loop = true;
    player.volume = savedVolume;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // One-time migration from legacy MMKV keys
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;

    const legacyUri = storage.getString(LEGACY_MUSIC_FILE_URI);
    const legacyName = storage.getString(LEGACY_MUSIC_FILE_NAME);
    if (!legacyUri || !legacyName) return;

    try {
      const id = uuid.v4() as string;
      const ext = legacyName.split('.').pop() || 'mp3';
      const fileName = `${id}.${ext}`;
      copyToMusicDir(legacyUri, fileName);
      const file: MusicFile = {id, name: legacyName, fileName};
      dispatch(addFile(file));
      dispatch(setActiveFile(id));
      player.replace({uri: getMusicFileUri(fileName)});
    } catch {
      // Migration failed — legacy file may have been deleted
    } finally {
      storage.remove(LEGACY_MUSIC_FILE_URI);
      storage.remove(LEGACY_MUSIC_FILE_NAME);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch activeFile changes and update player source
  const prevActiveIdRef = useRef(activeFileId);
  useEffect(() => {
    if (activeFileId === prevActiveIdRef.current) return;
    prevActiveIdRef.current = activeFileId;

    if (activeFile) {
      player.replace({uri: getMusicFileUri(activeFile.fileName)});
    }
  }, [activeFile, activeFileId, player]);

  const play = useCallback(() => {
    player.play();
  }, [player]);

  const pause = useCallback(() => {
    player.pause();
  }, [player]);

  const setLiveVolume = useCallback(
    (v: number) => {
      player.volume = Math.max(0, Math.min(1, v));
    },
    [player],
  );

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      player.volume = clamped;
      storage.set(MUSIC_BG_VOLUME, clamped);
    },
    [player],
  );

  const pickLocalFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const id = uuid.v4() as string;
    const ext = asset.name.split('.').pop() || 'mp3';
    const fileName = `${id}.${ext}`;
    copyToMusicDir(asset.uri, fileName);
    const file: MusicFile = {id, name: asset.name, fileName};
    dispatch(addFile(file));
    dispatch(setActiveFile(id));
    player.replace({uri: getMusicFileUri(fileName)});
  }, [dispatch, player]);

  const pasteUrl = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;

    let trimmed = text.trim();
    // Prepend http:// if no scheme is present
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = `http://${trimmed}`;
    }

    const id = uuid.v4() as string;
    // Try to extract a filename from the URL path
    const urlPath = trimmed.split('?')[0];
    const segments = urlPath.split('/');
    const lastSegment = segments[segments.length - 1] || 'download';
    const ext = lastSegment.includes('.') ? lastSegment.split('.').pop() : 'mp3';
    const displayName = decodeURIComponent(lastSegment) || 'Downloaded track';
    const fileName = `${id}.${ext}`;

    setIsDownloading(true);

    const audioExtensions = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'opus'];
    const hasAudioExt = audioExtensions.includes((ext ?? '').toLowerCase());

    try {
      const downloaded = await downloadToMusicDir(trimmed, fileName);

      if (!downloaded) return;

      if (!downloaded.type.startsWith('audio/') && !hasAudioExt) {
        deleteFromMusicDir(fileName);
        return;
      }

      const file: MusicFile = {id, name: displayName, fileName};
      dispatch(addFile(file));
      dispatch(setActiveFile(id));
      player.replace({uri: getMusicFileUri(fileName)});
    } catch {
      deleteFromMusicDir(fileName);
    } finally {
      setIsDownloading(false);
    }
  }, [dispatch, player]);

  const playFile = useCallback(
    (id: string) => {
      if (id === activeFileId) {
        // Toggle play/pause for the already-active file
        if (status.playing) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }
      dispatch(setActiveFile(id));
    },
    [activeFileId, dispatch, player, status.playing],
  );

  const deleteFile = useCallback(
    (id: string) => {
      const state = store.getState();
      const file = state.musicLibrary.files.find(
        (f: MusicFile) => f.id === id,
      );
      if (!file) return;

      if (id === activeFileId) {
        player.pause();
      }

      deleteFromMusicDir(file.fileName);
      dispatch(removeFile(id));
    },
    [activeFileId, dispatch, player],
  );

  const value = {
    isPlaying: status.playing,
    isLoaded: status.isLoaded,
    volume: player.volume,
    activeFileName: activeFile?.name ?? null,
    isDownloading,
    play,
    pause,
    setVolume,
    setLiveVolume,
    pickLocalFile,
    pasteUrl,
    playFile,
    deleteFile,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error(
      'useAudioPlayer must be used within an AudioPlayerProvider',
    );
  }
  return context;
};
