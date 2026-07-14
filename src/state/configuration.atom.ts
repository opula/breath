import {atom, mmkvStorage, selector, update} from 'concordia';
import {
  DEFAULT_BACKGROUND_SOURCE_ID,
  getBackgroundSourceIdByIndex,
  getBackgroundSourceIndexById,
  isSceneSourceId,
  type SceneSourceId,
} from '../backgrounds/metadata';
import {storage} from '../utils/storage';
import {legacySlice} from './legacy';

export type TimerProgressMode = 'always' | 'minuteFade' | 'endOn' | 'endFade';

interface ConfigurationState {
  isGrayscale: boolean;
  bgSourceId: SceneSourceId;
  soundsEnabled: boolean;
  hapticsEnabled: boolean;
  hideCenterHints: boolean;
  timerProgressMode: TimerProgressMode;
}

const initialState: ConfigurationState = {
  isGrayscale: false,
  bgSourceId: DEFAULT_BACKGROUND_SOURCE_ID,
  soundsEnabled: true,
  hapticsEnabled: true,
  hideCenterHints: false,
  timerProgressMode: 'always',
};

/**
 * Legacy seed, folding in the old redux-persist `migrate` (v1): resolve
 * bgSourceIndex -> bgSourceId, drop unknown/removed fields (isPaused was
 * blacklisted; bgSourceIndex is legacy-only).
 */
function legacyConfiguration(): ConfigurationState | null {
  const legacy = legacySlice<ConfigurationState & {bgSourceIndex?: number}>(
    'configuration',
  );
  if (!legacy) return null;
  const merged = {...initialState, ...legacy};
  if (!isSceneSourceId(merged.bgSourceId)) {
    merged.bgSourceId =
      typeof legacy.bgSourceIndex === 'number'
        ? getBackgroundSourceIdByIndex(legacy.bgSourceIndex)
        : DEFAULT_BACKGROUND_SOURCE_ID;
  }
  const {bgSourceIndex: _dropped, isPaused: _session, ...clean} =
    merged as ConfigurationState & {bgSourceIndex?: number; isPaused?: boolean};
  return clean;
}

export const configuration$ = atom(
  'configuration',
  legacyConfiguration() ?? initialState,
  {persist: {storage: mmkvStorage(storage)}},
);

/**
 * Session-only playback state. Was `configuration.isPaused` under a
 * redux-persist blacklist — persistence-by-composition: state that shouldn't
 * persist lives in its own unpersisted atom.
 */
export const playback$ = atom('playback', {isPaused: true});

export const setPause = update('playback/setPause', {p: playback$},
  (d, paused: boolean) => {
    d.p.isPaused = paused;
  });

export const togglePaused = update('playback/togglePaused', {p: playback$}, d => {
  d.p.isPaused = !d.p.isPaused;
});

export const toggleGrayscale = update('configuration/toggleGrayscale', {c: configuration$}, d => {
  d.c.isGrayscale = !d.c.isGrayscale;
});

export const toggleSounds = update('configuration/toggleSounds', {c: configuration$}, d => {
  d.c.soundsEnabled = !d.c.soundsEnabled;
});

export const toggleHaptics = update('configuration/toggleHaptics', {c: configuration$}, d => {
  d.c.hapticsEnabled = !d.c.hapticsEnabled;
});

export const toggleHideCenterHints = update('configuration/toggleHideCenterHints', {c: configuration$}, d => {
  d.c.hideCenterHints = !d.c.hideCenterHints;
});

export const setTimerProgressMode = update('configuration/setTimerProgressMode', {c: configuration$},
  (d, mode: TimerProgressMode) => {
    d.c.timerProgressMode = mode;
  });

export const updateSource = update('configuration/updateSource', {c: configuration$},
  (d, sourceId: SceneSourceId) => {
    d.c.bgSourceId = sourceId;
  });

// Legacy resolution now happens at hydration, so this is a plain read.
export const sourceIndex$ = selector(configuration$.bgSourceId, id =>
  getBackgroundSourceIndexById(id),
);
