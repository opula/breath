import {Storage} from 'redux-persist';
import {reduxPersistedStorage} from './utils/storage';

export const reduxStorage: Storage = {
  setItem: (key, value) => {
    reduxPersistedStorage.set(key, value);
    return Promise.resolve(true);
  },
  getItem: key => {
    const value = reduxPersistedStorage.getString(key);
    return Promise.resolve(value);
  },
  removeItem: key => {
    reduxPersistedStorage.delete(key);
    return Promise.resolve();
  },
};
