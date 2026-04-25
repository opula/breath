export const NO_BACKGROUND_SOURCE_ID = "none" as const;

export const BACKGROUND_SOURCE_DEFINITIONS = [
  { id: "aurora", name: "Northern Drift" },
  { id: "circular", name: "Circular" },
  { id: "echo", name: "Echo" },
  { id: "rorschach", name: "Mirror Bloom" },
  { id: "starfield", name: "Starfield" },
  { id: "waves", name: "Waves" },
  { id: "wormhole", name: "Wormhole" },
  { id: "dither-pulse", name: "Signal Bloom" },
  { id: "particles", name: "Particles" },
  { id: "terrain", name: "Terrain" },
  { id: "dot-grid", name: "DotGrid" },
  { id: "game-of-life", name: "GameOfLife" },
  { id: "sin-pulse", name: "Harmonic Tide" },
  { id: "fluid", name: "Fluid" },
  { id: "ethereal", name: "Inner Current" },
  { id: "dream-smoke", name: "Tidal Veil" },
  { id: "particle-wave", name: "Stillwater" },
  { id: "particle-helix", name: "ParticleHelix" },
] as const;

export type BackgroundSourceDefinition =
  (typeof BACKGROUND_SOURCE_DEFINITIONS)[number];
export type BackgroundSourceId = BackgroundSourceDefinition["id"];
export type SceneSourceId = BackgroundSourceId | typeof NO_BACKGROUND_SOURCE_ID;

export const DEFAULT_BACKGROUND_SOURCE_ID: BackgroundSourceId = "sin-pulse";

const backgroundSourceIds = new Set<string>(
  BACKGROUND_SOURCE_DEFINITIONS.map((source) => source.id),
);

export const isBackgroundSourceId = (
  sourceId: unknown,
): sourceId is BackgroundSourceId =>
  typeof sourceId === "string" && backgroundSourceIds.has(sourceId);

export const isSceneSourceId = (
  sourceId: unknown,
): sourceId is SceneSourceId =>
  sourceId === NO_BACKGROUND_SOURCE_ID || isBackgroundSourceId(sourceId);

export const getBackgroundSourceIdByIndex = (index: number): SceneSourceId => {
  if (index === -1) {
    return NO_BACKGROUND_SOURCE_ID;
  }

  return BACKGROUND_SOURCE_DEFINITIONS[index]?.id ?? DEFAULT_BACKGROUND_SOURCE_ID;
};

export const getBackgroundSourceIndexById = (
  sourceId: SceneSourceId,
): number => {
  if (sourceId === NO_BACKGROUND_SOURCE_ID) {
    return -1;
  }

  return BACKGROUND_SOURCE_DEFINITIONS.findIndex(
    (source) => source.id === sourceId,
  );
};
