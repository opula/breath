import {
  Fn,
  clamp,
  dot,
  float,
  fract,
  length,
  mix,
  screenUV,
  sin,
  smoothstep,
  vec2,
  vec3,
} from "three/tsl";

// Shared 16mm-style finishing pass: desaturate, lift the blacks, roll the
// highlights off below pure white, add animated luminance-weighted grain and
// a gentle vignette. Grayscale mixes last so the toggle always lands on the
// final graded image. Expects display-referred (already tone-mapped) input;
// applied pre-tonemap it simply reads as a softer grade.

const LUMA = vec3(0.299, 0.587, 0.114);

const DESATURATION = 0.32;
const GAIN = 0.9;
const BLACK_LIFT = 0.028;
// Extended-Reinhard white point: near-identity in the shadows, highlights
// asymptote to ~0.95 so nothing ever reaches pure white.
const SHOULDER_WHITE = 1.05;
const GRAIN_STRENGTH = 0.024;
const GRAIN_LUMA_FLOOR = 0.35;
const VIGNETTE_START = 0.7;
const VIGNETTE_END = 1.55;
const VIGNETTE_STRENGTH = 0.28;

export const filmicFinish = Fn(
  ([color, time, fragCoord, grayscale]: [
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
  ]) => {
    const luma = dot(color, LUMA);
    const muted = mix(color, vec3(luma, luma, luma), float(DESATURATION));

    // Lifted blacks + capped highlights: gain down, lift, then a smooth
    // extended-Reinhard shoulder.
    const lifted = muted.mul(GAIN).add(BLACK_LIFT);
    const capped = lifted
      .mul(lifted.div(SHOULDER_WHITE * SHOULDER_WHITE).add(1.0))
      .div(lifted.add(1.0));

    // Animated signed grain, weighted toward the mids by luminance.
    const jitter = fract(time.mul(13.7)).mul(291.7);
    const grainLuma = dot(capped, LUMA);
    const grain = fract(
      sin(dot(fragCoord.add(jitter), vec2(12.9898, 78.233))).mul(43758.5453),
    )
      .sub(0.5)
      .mul(2.0 * GRAIN_STRENGTH)
      .mul(float(GRAIN_LUMA_FLOOR).add(grainLuma));
    const grained = capped.add(grain);

    const vignette = float(1.0).sub(
      smoothstep(
        float(VIGNETTE_START),
        float(VIGNETTE_END),
        length(screenUV.sub(0.5)).mul(2.0),
      ).mul(VIGNETTE_STRENGTH),
    );
    const out = clamp(
      grained.mul(vignette),
      vec3(0.0, 0.0, 0.0),
      vec3(1.0, 1.0, 1.0),
    );

    const outLuma = dot(out, LUMA);
    return mix(out, vec3(outLuma, outLuma, outLuma), grayscale);
  },
);
