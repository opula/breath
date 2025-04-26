import { Skia } from "@shopify/react-native-skia";

// --- Create Skia RuntimeEffect for Rorschach Shader (Adjusted) ---
export const source = Skia.RuntimeEffect.Make(`
  // Uniforms provided by Skia/Host
  uniform float2 canvas; // Resolution (width, height)
  uniform float iTime;  // Time in seconds

  // --- Rorschach Parameters (Adjusted) ---
  // const vec3 backgroundColor = vec3(0.1, 0.12, 0.15); // Darker background (Dark Slate Blue/Grey)
  const vec3 backgroundColor = vec3(0.0, 0.0, 0.0); // Darker background (Dark Slate Blue/Grey)
  const vec3 inkColor = vec3(0.6, 0.65, 0.7);       // Lighter Ink color for contrast on dark bg (Cool Grey)
                                                     // Alt ink: vec3(0.2, 0.15, 0.25) for dark ink on dark bg

  const float zoom = 7.0;            // Increased zoom -> Smaller patterns, finer detail
  const float timeScale = 0.1;       // Slightly faster evolution to see changes with finer detail
  const int FBM_OCTAVES = 5;           // Noise detail
  const float FBM_LACUNARITY = 2.1;    // Frequency multiplier per octave
  const float FBM_GAIN = 0.45;         // Amplitude multiplier per octave

  // --- Noise Functions (Using 3D Noise for time evolution) ---
  // 3D hash function
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  // 3D Value Noise function
  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float v000 = dot(hash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
    float v100 = dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
    float v010 = dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
    float v110 = dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
    float v001 = dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
    float v101 = dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
    float v011 = dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
    float v111 = dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));

    return mix(mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
               mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y), u.z);
  }

  // --- 3D Fractal Brownian Motion (FBM) Function ---
  float fbm3D(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < FBM_OCTAVES; i++) {
        total += noise3D(p * frequency) * amplitude;
        frequency *= FBM_LACUNARITY;
        amplitude *= FBM_GAIN;
    }
    return total;
  }

  // --- Main Shader Function ---
  vec4 main(vec2 pos) {
      // Normalize, center, aspect correct coordinates
      vec2 uv = pos / canvas;
      uv = uv * 2.0 - 1.0;
      uv.x *= canvas.x / canvas.y;

      // Implement Vertical Symmetry
      float symmetricalX = abs(uv.x);

      // Prepare Coordinates for 3D Noise
      vec3 noiseCoord = vec3(symmetricalX * zoom, uv.y * zoom, iTime * timeScale);

      // Calculate FBM Noise
      float noiseValue = fbm3D(noiseCoord);

      // Map Noise to "Ink" Intensity
      // Adjust smoothstep thresholds slightly if needed based on new zoom/colors
      // Using a slightly wider range for potentially softer edges with finer details
      float inkIntensity = smoothstep(-0.15, 0.25, noiseValue); // Map noise range [-0.15, 0.25] -> [0, 1]

      // Blend Colors
      vec3 color = mix(backgroundColor, inkColor, inkIntensity);

      // Output
      return vec4(color, 1.0);
  }
`)!;

// Optional: Export the source
// export { source };
