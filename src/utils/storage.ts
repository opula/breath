import {createMMKV} from 'react-native-mmkv';

export const storage = createMMKV();
export const reduxPersistedStorage = createMMKV({
  id: 'redux',
});

export const HAS_COMPLETED_WELCOME = 'HAS_COMPLETED_WELCOME';
export const HAS_SEEN_TUTORIAL = 'HAS_SEEN_TUTORIAL';

export const LAST_SOURCE = 'LAST_SOURCE';
export const LAST_EXERCISE = 'LAST_EXERCISE';
export const LAST_GRAYSCALE = 'LAST_GRAYSCALE';

export const MUSIC_BG_VOLUME = 'MUSIC_BG_VOLUME';

// Legacy keys — used only for one-time migration
export const LEGACY_MUSIC_FILE_URI = 'MUSIC_FILE_URI';
export const LEGACY_MUSIC_FILE_NAME = 'MUSIC_FILE_NAME';
