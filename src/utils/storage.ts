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

export const LAST_TRACK_PLAYED = 'LAST_TRACK_PLAYED';

export const MUSIC_MIX_MODE = 'MUSIC_MIX_MODE';
export const MUSIC_BG_VOLUME = 'MUSIC_BG_VOLUME';
