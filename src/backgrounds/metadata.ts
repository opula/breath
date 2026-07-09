export const NO_BACKGROUND_SOURCE_ID = "none" as const;

export const BACKGROUND_SOURCE_DEFINITIONS = [
  { id: "iris", name: "Iris" },
  { id: "longwater", name: "Longwater" },
  { id: "lightstream", name: "Lightstream" },
  { id: "passage", name: "Passage" },
  { id: "sea-smoke", name: "Sea Smoke" },
  { id: "stillwater", name: "Stillwater" },
  { id: "sundown", name: "Sundown" },
  { id: "undercurrent", name: "Undercurrent" },
  { id: "ember-vale", name: "Ember Vale" },
  { id: "isobar", name: "Isobar" },
  { id: "seagrass", name: "Seagrass" },
] as const;

export type BackgroundSourceDefinition =
  (typeof BACKGROUND_SOURCE_DEFINITIONS)[number];
export type BackgroundSourceId = BackgroundSourceDefinition["id"];
export type SceneSourceId = BackgroundSourceId | typeof NO_BACKGROUND_SOURCE_ID;

// Stale persisted ids (including every archived scene) fall back here via
// the isSceneSourceId guard + BackgroundSurface fallback.
export const DEFAULT_BACKGROUND_SOURCE_ID: BackgroundSourceId = "longwater";

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
