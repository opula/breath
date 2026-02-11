import { source as SpaceGifSource } from "../../shaders/SpaceGif";
import { source as StarfieldSource } from "../../shaders/Starfield";
import { source as BlocksSource } from "../../shaders/Blocks";
import { source as AuroraSource } from "../../shaders/Aurora";
import { source as ButterflySource } from "../../shaders/Butterfly";
import { source as EchoSource } from "../../shaders/Echo";
import { source as RorschachSource } from "../../shaders/Rorschach";
import { source as StarfallSource } from "../../shaders/Starfall";
import { source as WavesSource } from "../../shaders/Waves";
import { source as CircularSource } from "../../shaders/Circular";
import { source as TunnelSource } from "../../shaders/Tunnel";
import { source as RipplesSource } from "../../shaders/Ripples";
import { source as CircleSource } from "../../shaders/Circle";
import { source as IntrospectiveSource } from "../../shaders/Introspective";
import { source as SpaceZoomSource } from "../../shaders/SpaceZoom";

// Skia shader sources (indices 0 through skiaSources.length - 1)
export const skiaSources = [
  SpaceGifSource,
  StarfieldSource,
  BlocksSource,
  AuroraSource,
  EchoSource,
  RorschachSource,
  StarfallSource,
  WavesSource,
  CircularSource,
  TunnelSource,
  RipplesSource,
];

// Three.js background names (indices skiaSources.length and beyond)
export const threeBackgrounds = ["Wormhole"] as const;

// Keep the old export name for backward compatibility during transition
export const sources = skiaSources;

// Total number of backgrounds available (Skia + Three.js)
export const TOTAL_BACKGROUNDS = skiaSources.length + threeBackgrounds.length;
