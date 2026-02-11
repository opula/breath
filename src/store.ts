import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";
import { reduxStorage } from "./storage";

import { exercisesReducer as exercises } from "./state/exercises.reducer";
import { configurationReducer as configuration } from "./state/configuration.reducer";
import { musicLibraryReducer as musicLibrary } from "./state/musicLibrary.reducer";

const rootReducers = combineReducers({
  exercises,
  configuration,
  musicLibrary,
});

export const store = configureStore({
  reducer: rootReducers,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ["persist/PERSIST"],
        // Ignore these field paths in all actions
        // ignoredActionPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        // ignoredPaths: ['items.dates'],
      },
    }),
});

export const persistor = persistStore(store);

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
