import type { ComponentType } from "react";
import type { SharedValue } from "react-native-reanimated";
import { Aurora } from "../../backgrounds/Aurora";
import { Wormhole } from "../../backgrounds/Wormhole";
import { Starfield } from "../../backgrounds/Starfield";
import { Rorschach } from "../../backgrounds/Rorschach";
import { Waves } from "../../backgrounds/Waves";
import { Circular } from "../../backgrounds/Circular";
import { Echo } from "../../backgrounds/Echo";
import { DitherPulse } from "../../backgrounds/DitherPulse";
import { Particles } from "../../backgrounds/Particles";
import { Terrain } from "../../backgrounds/Terrain";
import { DotGrid } from "../../backgrounds/DotGrid";
import { GameOfLife } from "../../backgrounds/GameOfLife";
import { SinPulse } from "../../backgrounds/SinPulse";
import { Fluid } from "../../backgrounds/Fluid";
import { Ethereal } from "../../backgrounds/Ethereal";
import { DreamSmoke } from "../../backgrounds/DreamSmoke";
import { ParticleWave } from "../../backgrounds/ParticleWave";
import { ParticleHelix } from "../../backgrounds/ParticleHelix";
import { Endless } from "../../backgrounds/Endless";
import { Traversal } from "../../backgrounds/Traversal";
import { LightWaves } from "../../backgrounds/LightWaves";
import { Atmosphere } from "../../backgrounds/Atmosphere";
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

const BackgroundComponentById = {
  aurora: Aurora,
  circular: Circular,
  echo: Echo,
  rorschach: Rorschach,
  starfield: Starfield,
  waves: Waves,
  wormhole: Wormhole,
  "dither-pulse": DitherPulse,
  particles: Particles,
  terrain: Terrain,
  "dot-grid": DotGrid,
  "game-of-life": GameOfLife,
  "sin-pulse": SinPulse,
  fluid: Fluid,
  ethereal: Ethereal,
  "dream-smoke": DreamSmoke,
  "particle-wave": ParticleWave,
  "particle-helix": ParticleHelix,
  endless: Endless,
  progression: Traversal,
  "light-waves": LightWaves,
  atmosphere: Atmosphere,
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
