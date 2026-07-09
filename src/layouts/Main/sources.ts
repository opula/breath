import type { ComponentType } from "react";
import type { SharedValue } from "react-native-reanimated";
import { Iris } from "../../backgrounds/Iris";
import { Longwater } from "../../backgrounds/Longwater";
import { Lightstream } from "../../backgrounds/Lightstream";
import { Passage } from "../../backgrounds/Passage";
import { SeaSmoke } from "../../backgrounds/SeaSmoke";
import { Stillwater } from "../../backgrounds/Stillwater";
import { Sundown } from "../../backgrounds/Sundown";
import { Undercurrent } from "../../backgrounds/Undercurrent";
import { EmberVale } from "../../backgrounds/EmberVale";
import { Isobar } from "../../backgrounds/Isobar";
import { Seagrass } from "../../backgrounds/Seagrass";
import {
  BACKGROUND_SOURCE_DEFINITIONS,
  type BackgroundSourceId,
} from "../../backgrounds/metadata";

export {
  DEFAULT_BACKGROUND_SOURCE_ID,
  NO_BACKGROUND_SOURCE_ID,
  type BackgroundSourceId,
  type SceneSourceId,
} from "../../backgrounds/metadata";

type BackgroundProps = {
  grayscale?: boolean;
  breath?: SharedValue<number>;
  onReady?: () => void;
};

// Retired scenes live in src/backgrounds/archive (unregistered, code kept).
const BackgroundComponentById = {
  iris: Iris,
  longwater: Longwater,
  lightstream: Lightstream,
  passage: Passage,
  "sea-smoke": SeaSmoke,
  stillwater: Stillwater,
  sundown: Sundown,
  undercurrent: Undercurrent,
  "ember-vale": EmberVale,
  isobar: Isobar,
  seagrass: Seagrass,
} satisfies Record<BackgroundSourceId, ComponentType<BackgroundProps>>;

export const backgroundSources = BACKGROUND_SOURCE_DEFINITIONS.map((source) => ({
  ...source,
  Component: BackgroundComponentById[source.id],
}));

export const backgroundSourceById = Object.fromEntries(
  backgroundSources.map((source) => [source.id, source]),
) as Record<BackgroundSourceId, (typeof backgroundSources)[number]>;

export const backgrounds = backgroundSources.map((source) => source.name);

export const TOTAL_BACKGROUNDS = backgroundSources.length;
