import { Skia } from "@shopify/react-native-skia";

// --- Create Skia RuntimeEffect for MORE Zoomed Star Trails ---
export const source = Skia.RuntimeEffect.Make(`
  // Uniforms provided by Skia/Host
  uniform float2 canvas; // Resolution (width, height)
  uniform float iTime;  // Time in seconds

  // --- Star Trail Parameters ---
  const vec3 skyColor = vec3(0.04, 0.08, 0.15);      // Slightly darker sky
  const vec3 trailColor = vec3(0.9, 0.92, 0.96);     // Bright trails
  const vec2 poleStarOffset = vec2(0.0, 0.02);     // Further reduced offset due to higher zoom
  const float zoomFactor = 0.3;      // Further zoom IN (0.5 -> 0.3)

  const float rotationSpeed = 0.01;  // Keeping speed slow for calmness
  const float trailLength = 0.25;   // Increased length significantly (0.12 -> 0.25)
  const float trailSharpness = 14.0; // Increased sharpness for very long trails
  const float minRadius = 0.02;     // Adjusted min radius due to higher zoom
  const float maxRadius = 1.5;      // Max radius (relative to original scale)
  const float brightnessVariance = 0.5; // Slightly less variance maybe
  const float densityNoiseScale = 3.0;  // Further reduced scale for larger gaps after zoom
  const float densityThreshold = 0.35;  // Slightly higher threshold maybe for sparser feel
  const float densitySoftness = 0.1;

  const float PI = 3.1415926535;
  const float TWO_PI = 2.0 * PI;

  // --- Hash Functions ---
  float hash11(float p) { /* ... hash function ... */ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  vec2 hash12(float p) { /* ... hash function ... */ vec3 p3 = fract(vec3(p * 0.1031, p * 0.1030, p * 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

  // --- Noise Function (Simple 1D Value Noise) ---
  float noise1D(float x) { /* ... noise function ... */ float i = floor(x); float f = fract(x); float u = f * f * (3.0 - 2.0 * f); float h1 = hash11(i); float h2 = hash11(i + 1.0); return mix(h1, h2, u); }


  // --- Main Shader Function ---
  vec4 main(vec2 pos) {
      // Normalize, center, aspect correct coordinates
      vec2 uv = pos / canvas;
      uv = uv * 2.0 - 1.0;
      uv.x *= canvas.x / canvas.y;

      // --- Apply Zoom ---
      uv *= zoomFactor; // Scale UVs to zoom IN more

      // Calculate vector from the pole star center
      vec2 center = poleStarOffset;
      vec2 dir = uv - center;

      // Convert to polar coordinates
      float radius = length(dir);
      float angle = atan(dir.y, dir.x);

      float totalIntensity = 0.0;

      // Only calculate trails within the specified radius range
      if (radius > minRadius && radius < maxRadius) {
          // --- Calculate Base Trail Properties based on Radius ---
          float radiusSeed = floor(radius * 1000.0) / 1000.0;
          vec2 rand = hash12(radiusSeed * 51.7);
          float angleOffset = rand.x * TWO_PI;
          float brightnessFactor = 0.5 + rand.y * brightnessVariance;

          // --- Calculate Animated Angular Position ---
          float angularPos = fract(angle / TWO_PI + iTime * rotationSpeed + angleOffset);

          // --- Calculate Streak Shape Intensity ---
          // Using the same sharp falloff method
          float distFromHead = min(angularPos, 1.0 - angularPos);
          float streakShape = pow(max(0.0, 1.0 - distFromHead / (trailLength * 0.5)), trailSharpness);

          // --- Modulate Density/Visibility with Noise ---
          float densityNoise = noise1D(radius * densityNoiseScale + 23.4);
          float densityFactor = smoothstep(densityThreshold - densitySoftness,
                                           densityThreshold + densitySoftness,
                                           densityNoise);

          // --- Final Intensity ---
          totalIntensity = streakShape * densityFactor * brightnessFactor;
      }

      // Clamp intensity
      totalIntensity = clamp(totalIntensity, 0.0, 1.0);

      // --- Blend Colors ---
      vec3 color = mix(skyColor, trailColor, totalIntensity);

      // --- Output ---
      return vec4(color, 1.0);
  }
`)!;

// Optional: Export the source
// export { source };
