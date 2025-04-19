import { Skia } from "@shopify/react-native-skia";

// --- Create Skia RuntimeEffect for Hypnotic Flow Field ---
export const source = Skia.RuntimeEffect.Make(`
  // Uniforms provided by Skia/Host
  uniform float2 canvas; // Resolution (width, height)
  uniform float iTime;  // Time in seconds

  // --- Flow Field Parameters ---
  const vec3 color1 = vec3(0.1, 0.2, 0.4); // Deep Blue/Purple
  const vec3 color2 = vec3(0.8, 0.5, 0.7); // Soft Magenta/Pink
  const vec3 color3 = vec3(0.4, 0.8, 0.8); // Cyan/Teal

  const float noiseScale = 3.5;      // How zoomed-in the base noise is (higher = finer details)
  const float flowStrength = 0.2;    // How strongly the field influences advection
  const float flowTimeScale = 0.05;  // How quickly the underlying flow field evolves
  const float colorTimeScale = 0.1;  // How quickly the colors shift/pulse
  const float colorFrequency = 4.0;  // Spatial frequency of color patterns
  const int   advectionSteps = 15;   // Number of steps for backward advection (more = smoother paths, higher cost)
  const float stepSize = 0.03;       // Distance per advection step

  // --- Noise Functions (3D Value Noise) ---
  // 3D hash function -> vec3 in [-1, 1] range
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  // 3D Value Noise - returns value roughly in [-0.5, 0.5]
  float noise3D(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f); // Smooth cubic interpolation

    // Sample gradients at 8 cube corners and compute dot products
    float v000 = dot(hash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
    float v100 = dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
    float v010 = dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
    float v110 = dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
    float v001 = dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
    float v101 = dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
    float v011 = dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
    float v111 = dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));

    // Trilinear interpolation
    return mix(mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
               mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y), u.z);
  }

  // --- Flow Field Function ---
  // Generates a 2D vector field based on 3D noise, encouraging rotation
  vec2 getFlow(vec3 p) {
    // Sample noise at two slightly different positions/times to get components
    // Using noise value directly for components often works well enough.
    // A 90-degree rotation (-y, x) creates swirls from a scalar potential field's gradient.
    float noiseX = noise3D(p + vec3(12.3, 5.7, 9.1)); // Offset sample pos slightly
    float noiseY = noise3D(p);                       // Base sample pos

    // Return a vector rotated 90 degrees from the implicit gradient -> swirl
    return vec2(-noiseY, noiseX);
  }


  // --- Main Shader Function ---
  vec4 main(vec2 pos) {
      // Normalize, center, aspect correct coordinates
      vec2 uv = pos / canvas;
      uv = uv * 2.0 - 1.0; // Map to [-1, 1]
      uv.x *= canvas.x / canvas.y; // Aspect correction

      // --- Backward Advection ---
      // Start at the current pixel's position
      vec2 p = uv;
      float noiseTime = iTime * flowTimeScale;

      // Integrate backward in time along the flow field
      for (int i = 0; i < advectionSteps; ++i) {
          vec3 samplePos = vec3(p * noiseScale, noiseTime);
          vec2 flow = getFlow(samplePos);
          p -= flow * flowStrength * stepSize; // Move against the flow

          // Optional: slightly decrease noiseTime per step to sample field further back in time
          // noiseTime -= stepSize * flowTimeScale * 0.1; // Adjust multiplier
      }

      // --- Color Calculation ---
      // Use the final advected position 'p' and time to determine color
      // Create a smooth, time-varying blend between three colors

      // Use sine waves based on the final position and time for smooth blending factors
      float blendPhase = p.x * colorFrequency * 0.5 + p.y * colorFrequency * 0.8; // Spatial phase
      float timePhase = iTime * colorTimeScale;

      float blend1 = 0.5 + 0.5 * sin(blendPhase + timePhase + 0.0); // Range [0, 1]
      float blend2 = 0.5 + 0.5 * sin(blendPhase * 0.8 + timePhase * 1.2 + 2.0); // Slightly different freq/phase
      float blend3 = 0.5 + 0.5 * sin(blendPhase * 1.2 + timePhase * 0.7 + 4.0);

      // Normalize blend factors (approximate, ensures they roughly sum to 1 over space/time)
      float totalBlend = blend1 + blend2 + blend3 + 1e-5; // Add epsilon to avoid div by zero
      blend1 /= totalBlend;
      blend2 /= totalBlend;
      blend3 /= totalBlend;

      // Mix the colors using the blend factors
      vec3 color = color1 * blend1 + color2 * blend2 + color3 * blend3;

      // Optional: Add subtle brightness variation based on flow magnitude (can add detail)
      // float flowMag = length(getFlow(vec3(uv * noiseScale, iTime * flowTimeScale)));
      // color *= (0.8 + 0.4 * smoothstep(0.0, 0.5, flowMag)); // Boost brightness in stronger flow areas

      // --- Output ---
      return vec4(color, 1.0);
  }
`)!;

// Optional: Export the source
// export { source };
