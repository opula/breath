import { Skia } from "@shopify/react-native-skia";

// --- Create Skia RuntimeEffect with Additive Ripple Blending ---
export const source = Skia.RuntimeEffect.Make(`
  // Uniforms provided by Skia/Host
  uniform float2 canvas; // Resolution (width, height)
  uniform float iTime;  // Time in seconds

  // --- Define Simple Colors Directly ---
  const vec3 backgroundColor = vec3(0.05, 0.08, 0.15); // Dark Slate Blue
  const vec3 rippleColor = vec3(0.3, 0.5, 0.7);     // Soft Medium Blue

  // --- Constants for Ripples (Adjusted for Subtlety) ---
  const float PI = 3.1415926535;
  const float rippleFrequency = 12.0; // Wider ripples
  const float rippleSpeed = 0.8;    // Slower expansion
  const int NUM_RIPPLE_SOURCES = 3; // Number of ripple emitters
  const float noiseAmount = 0.015;  // Less distortion
  const float centerMoveSpeed = 0.05; // Slower center drift

  // --- Noise Functions (Simple Value Noise) ---
  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float h11 = dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float h12 = dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float h21 = dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float h22 = dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    return mix(mix(h11, h12, u.x), mix(h21, h22, u.x), u.y);
  }

  // --- Ripple Calculation (Adjusted for Subtlety) ---
  float calculateRipple(vec2 uv, vec2 center, float frequency, float speed, float time, float seed) {
      vec2 noiseCoord = uv * 4.0 + seed;
      float noiseVal = noise(noiseCoord + time * 0.1);
      vec2 perturbedUv = uv + vec2(noiseVal, noise(noiseCoord.yx)) * noiseAmount;

      float dist = length(perturbedUv - center);
      float wave = sin(dist * frequency - time * speed);
      float intensity = (wave + 1.0) * 0.5; // Intensity range [0, 1]

      intensity = smoothstep(0.2, 0.8, intensity); // Soft ramp for peaks
      float falloff = smoothstep(0.6, 0.1, dist); // Fade out
      intensity *= falloff;

      return intensity; // Return intensity [0, 1] per source
  }

  // --- Main Shader Function (Using Additive Blending) ---
  vec4 main(vec2 pos) {
      // Normalize, center, aspect correct
      vec2 uv = pos / canvas;
      uv = uv * 2.0 - 1.0;
      uv.x *= canvas.x / canvas.y;

      // --- Define Ripple Sources ---
      vec2 center1 = vec2(sin(iTime * centerMoveSpeed * 0.8 + 1.0) * 0.5, cos(iTime * centerMoveSpeed * 1.0 + 2.0) * 0.5);
      vec2 center2 = vec2(cos(iTime * centerMoveSpeed * 0.9 + 3.0) * 0.6, sin(iTime * centerMoveSpeed * 1.1 + 4.0) * 0.6);
      vec2 center3 = vec2(sin(iTime * centerMoveSpeed * 1.0 + 5.0) * 0.4, cos(iTime * centerMoveSpeed * 0.7 + 6.0) * 0.4);

      // --- Calculate and Combine Ripples using ADDITION ---
      float totalIntensity = 0.0;
      // ADD intensities instead of taking the max
      totalIntensity += calculateRipple(uv, center1, rippleFrequency * 1.0, rippleSpeed * 1.0, iTime, 1.0);
      totalIntensity += calculateRipple(uv, center2, rippleFrequency * 0.9, rippleSpeed * 1.1, iTime, 2.0);
      totalIntensity += calculateRipple(uv, center3, rippleFrequency * 1.1, rippleSpeed * 0.9, iTime, 3.0);

      // NOTE: totalIntensity can now potentially exceed 1.0 where ripples overlap

      // --- Determine Final Color using Simple Blend (Adjusted for Additive) ---

      // We need to map the potentially higher totalIntensity back into a [0, 1] range
      // for the blend factor. Adjust the smoothstep range and final multiplier.
      // Increase the upper bound of smoothstep to account for added intensities.
      // Reduce the final multiplier to keep the overall effect subtle.
      float blendFactor = smoothstep(0.1, 1.2, totalIntensity); // Map intensities 0.1->1.2 to blend 0->1
                                                                // Increase 1.2 if overlaps get too bright, decrease if too dim.
      blendFactor *= 0.45; // Reduce max ripple visibility further (adjust as needed)

      vec3 color = mix(backgroundColor, rippleColor, blendFactor);

      // --- Output ---
      // Optional: Clamp final color just in case (shouldn't be needed with mix)
      // color = clamp(color, 0.0, 1.0);
      return vec4(color, 1.0);
  }
`)!;
