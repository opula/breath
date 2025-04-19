import { Skia } from "@shopify/react-native-skia";

// --- Create Skia RuntimeEffect for Flowing Fog ---
export const source = Skia.RuntimeEffect.Make(`
  // Uniforms provided by Skia/Host
  uniform float2 canvas; // Resolution (width, height)
  uniform float iTime;  // Time in seconds

  // --- Fog Parameters (Tune these for desired look) ---
  const vec3 fogColorDark = vec3(0.1, 0.15, 0.25); // Dark Blue/Purple base
  const vec3 fogColorLight = vec3(0.4, 0.5, 0.65); // Lighter Misty Blue/Grey
  const float zoomFactor = 2.5;      // How zoomed in the noise pattern is (smaller value = larger patterns)
  const vec2 driftSpeed = vec2(0.03, 0.02); // How fast the fog drifts (x, y speed)
  const int FBM_OCTAVES = 5;         // Number of noise layers (more = finer detail, more computation)
  const float FBM_LACUNARITY = 2.0;  // How much frequency increases per octave
  const float FBM_GAIN = 0.5;        // How much amplitude decreases per octave

  // --- Noise Functions (Simple Value Noise) ---
  // Hash function to generate pseudo-random gradients
  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    // Return value in range [-1, 1] by multiplying by 2 and subtracting 1
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  // Value Noise function - interpolates hashed values at grid corners
  float noise(vec2 p) {
    vec2 i = floor(p); // Integer part of p
    vec2 f = fract(p); // Fractional part of p

    // Smooth interpolation function (cubic Hermite curve, f*f*(3.0-2.0*f))
    vec2 u = f * f * (3.0 - 2.0 * f);

    // Sample hash gradients at the four corners of the grid cell
    float v11 = dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float v12 = dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float v21 = dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float v22 = dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    // Interpolate along x, then along y
    return mix(mix(v11, v12, u.x), mix(v21, v22, u.x), u.y);
    // The output of this noise function is roughly in the range [-0.5, 0.5]
  }

  // --- Fractal Brownian Motion (FBM) Function ---
  // Sums multiple layers (octaves) of noise with increasing frequency and decreasing amplitude
  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5; // Start with base amplitude
    float frequency = 1.0; // Start with base frequency
    float amplitudeSum = 0.0; // Keep track of max possible amplitude for normalization

    for (int i = 0; i < FBM_OCTAVES; i++) {
        total += noise(p * frequency) * amplitude;
        amplitudeSum += amplitude; // Add current amplitude to the total sum
        frequency *= FBM_LACUNARITY; // Increase frequency for next octave
        amplitude *= FBM_GAIN;       // Decrease amplitude for next octave
    }

    // Optional: Normalize the result to be roughly in [-0.5, 0.5] like single noise call
    // This makes the smoothstep mapping more predictable later.
    // Divide by the sum of amplitudes (0.5 + 0.25 + 0.125 + ...)
    // The sum of a geometric series a / (1 - r) = 0.5 / (1 - 0.5) = 1.0
    // However, value noise range isn't exactly [-0.5, 0.5], so simple division isn't perfect.
    // We can skip explicit normalization and adjust the smoothstep range below instead.
    // return total / amplitudeSum;
    return total; // Raw FBM value (range depends on octaves/gain)
  }

  // --- Main Shader Function ---
  vec4 main(vec2 pos) {
      // Normalize, center, aspect correct coordinates
      vec2 uv = pos / canvas;
      uv = uv * 2.0 - 1.0;
      uv.x *= canvas.x / canvas.y;

      // Calculate noise coordinates with zoom and time-based drift
      vec2 noiseCoord = uv * zoomFactor + iTime * driftSpeed;

      // Calculate the FBM noise value
      float noiseValue = fbm(noiseCoord);

      // --- Map Noise Value to Color ---
      // The raw FBM value range depends on octaves. For 5 octaves, it's roughly [-0.8, 0.8].
      // We use smoothstep to map this range smoothly to [0, 1] for blending.
      // Adjust the input range (-0.6, 0.6) of smoothstep to control contrast and brightness.
      // Smaller range = higher contrast. Shift the range up/down to make it lighter/darker.
      float blendFactor = smoothstep(-0.6, 0.6, noiseValue); // Map noise range [-0.6, 0.6] -> [0, 1]

      // Blend between the dark and light fog colors based on the mapped noise value
      vec3 color = mix(fogColorDark, fogColorLight, blendFactor);

      // --- Output ---
      return vec4(color, 1.0); // Output final color with full alpha
  }
`)!;

// Optional: Export the source
// export { source };
