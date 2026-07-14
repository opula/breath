import {reduxPersistedStorage} from '../utils/storage';

/**
 * One-time redux-persist migration reader. Breath used per-slice
 * persistReducer, so each slice lives at 'persist:<key>' in the dedicated
 * 'redux' MMKV instance, with each FIELD JSON-stringified inside the
 * envelope. Used only as atom initial values — self-retiring once concordia
 * materializes its own keys (which happens at first hydration).
 */
export function legacySlice<T extends object>(key: string): Partial<T> | null {
  try {
    const raw = reduxPersistedStorage.getString(`persist:${key}`);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(envelope)) {
      if (field === '_persist') continue;
      out[field] = JSON.parse(value);
    }
    return out as Partial<T>;
  } catch {
    return null;
  }
}
