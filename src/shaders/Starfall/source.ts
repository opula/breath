import { Skia } from "@shopify/react-native-skia";

// --- Create Skia RuntimeEffect for Shooting Star Rain ---
export const source = Skia.RuntimeEffect.Make(`
  // Uniforms provided by Skia/Host
  uniform float2 canvas; // Resolution (width, height)
  uniform float iTime;  // Time in seconds

  // --- Rain Parameters (Tune these) ---
  const vec3 backgroundColor = vec3(0.05, 0.08, 0.12); // Even darker background
  const vec3 starColor = vec3(0.8, 0.85, 0.95);      // Bright, slightly cool white/blue

  // Shape Parameters
  const float HEAD_RADIUS = 0.008;   // Radius of the bright head
  const float HEAD_SOFTNESS = 2.5;   // Falloff exponent for the head (higher = softer)
  const float TAIL_LENGTH = 0.08;    // How long the tail extends vertically
  const float TAIL_WIDTH_FACTOR = 0.4; // Tail width relative to head radius (smaller = narrower)
  const float TAIL_FADE_POWER = 1.5; // How quickly the tail fades (higher = faster fade)
  const float TAIL_BRIGHTNESS = 0.7; // Max brightness of the tail relative to the head

  // General Parameters
  const float HORIZONTAL_JITTER = 0.7;

  // Layer 1 (Foreground - Faster, Brighter)
  const float DENSITY_1 = 35.0;
  const float SPEED_1 = 0.4;       // Keep speeds relatively slow
  const float SIZE_VARIANCE_1 = 0.5;
  const float BRIGHTNESS_1 = 0.9;
  const float SPEED_VARIANCE_1 = 0.3;

  // Layer 2 (Midground)
  const float DENSITY_2 = 50.0;
  const float SPEED_2 = 0.25;
  const float SIZE_VARIANCE_2 = 0.4;
  const float BRIGHTNESS_2 = 0.65;
  const float SPEED_VARIANCE_2 = 0.2;

  // Layer 3 (Background - Slower, Dimmer)
  const float DENSITY_3 = 65.0;
  const float SPEED_3 = 0.15;
  const float SIZE_VARIANCE_3 = 0.3;
  const float BRIGHTNESS_3 = 0.4;
  const float SPEED_VARIANCE_3 = 0.15;


  // --- Hash Functions ---
  float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  vec2 hash12(float p){ vec3 p3 = fract(vec3(p*0.1031, p*0.1030, p*0.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
  vec3 hash13(float p){ vec3 p3 = fract(vec3(p*0.1031, p*0.1030, p*0.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xyz+p3.yzx)*p3.zyx); }

  // --- Function Calculates Intensity for a Shooting Star Shape ---
  // Takes position relative to the particle head (already wrapped & aspect corrected)
  // Returns intensity from 0 to potentially > 1 (needs clamping later)
  float getStarIntensity(vec2 relativePos, float headRadius, float sizeFactor) {
      float currentHeadRadius = headRadius * sizeFactor;
      float currentTailLength = TAIL_LENGTH * sizeFactor; // Scale tail length too

      // --- Head Intensity Calculation ---
      // Distance from the head's center
      float distFromHead = length(relativePos);
      float headIntensity = pow(max(0.0, 1.0 - distFromHead / currentHeadRadius), HEAD_SOFTNESS);

      // --- Tail Intensity Calculation ---
      float tailIntensity = 0.0;
      // Tail only appears *above* the head (negative relative Y) and within tail length
      if (relativePos.y < 0.0 && relativePos.y > -currentTailLength) {
          // Vertical fade (0 at top of tail, 1 at head)
          float vertFade = 1.0 - abs(relativePos.y / currentTailLength);
          vertFade = pow(vertFade, TAIL_FADE_POWER); // Apply power for faster fade

          // Horizontal fade (based on head radius, making tail narrower)
          float tailWidth = currentHeadRadius * TAIL_WIDTH_FACTOR;
          float horzFade = pow(max(0.0, 1.0 - abs(relativePos.x) / tailWidth), 2.0); // Sharper horizontal fade

          tailIntensity = vertFade * horzFade * TAIL_BRIGHTNESS;
      }

      // Combine head and tail - simple addition works well here
      // Allowing potential overlap to be brighter than 1 initially
      return headIntensity + tailIntensity;
  }


  // --- Function to Render One Layer of Shooting Stars (Corrected Wrapping) ---
  float renderStarLayer(vec2 uv, float time, float density, float baseSpeed, float baseBrightness, float speedVariance, float sizeVariance, float layerSeed, float aspect) {
      float column = floor(uv.x * density + layerSeed);
      vec3 rand = hash13(column); // .x=phase, .y=speedVar, .z=size/brightnessVar

      float speed = baseSpeed * (1.0 + (rand.y - 0.5) * 2.0 * speedVariance);
      float sizeFactor = (1.0 + (rand.z - 0.5) * 2.0 * sizeVariance);
      float brightness = baseBrightness; // Apply overall brightness later

      // --- Calculate Particle Head Position ---
      float particleX = (column + hash11(column + 1.0) * HORIZONTAL_JITTER) / density;
      float particleY_base = fract(rand.x + time * speed); // Base Y position (0 to 1)

      // --- Calculate Pixel Position Relative to Particle Head (Handling Wrap) ---
      vec2 relativePos;
      relativePos.x = (uv.x - particleX) * aspect; // Apply aspect correction to X
      // Calculate shortest vertical distance considering wrap-around
      float dy_raw = uv.y - particleY_base;
      relativePos.y = fract(dy_raw + 0.5) - 0.5; // Result in [-0.5, 0.5]

      // --- Calculate Intensity using the Shape Function ---
      float intensity = getStarIntensity(relativePos, HEAD_RADIUS, sizeFactor);

      // Apply final brightness for this star instance
      intensity *= brightness * sizeFactor; // Link final brightness slightly to size

      return intensity;
  }


  // --- Main Shader Function ---
  vec4 main(vec2 pos) {
      vec2 uv = pos / canvas;
      float aspect = canvas.x / canvas.y;

      float totalIntensity = 0.0;

      // Render Layers
      totalIntensity += renderStarLayer(uv, iTime, DENSITY_1, SPEED_1, BRIGHTNESS_1, SPEED_VARIANCE_1, SIZE_VARIANCE_1, 0.0, aspect);
      totalIntensity += renderStarLayer(uv, iTime, DENSITY_2, SPEED_2, BRIGHTNESS_2, SPEED_VARIANCE_2, SIZE_VARIANCE_2, 17.0, aspect);
      totalIntensity += renderStarLayer(uv, iTime, DENSITY_3, SPEED_3, BRIGHTNESS_3, SPEED_VARIANCE_3, SIZE_VARIANCE_3, 31.0, aspect);

      // Clamp final total intensity before mixing
      totalIntensity = clamp(totalIntensity, 0.0, 1.0);

      // Blend Background and Star Color
      vec3 color = mix(backgroundColor, starColor, totalIntensity);

      return vec4(color, 1.0);
  }
`)!;

// Optional: Export the source
// export { source };
