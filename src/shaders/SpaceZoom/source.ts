import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;
  uniform float quality; // Default to high quality

  // Soft color palette for gentle visuals
  const vec3 colorA = vec3(0.15, 0.2, 0.25);   // Deep base color
  const vec3 colorB = vec3(0.4, 0.35, 0.3);    // Subtle variation
  const vec3 colorC = vec3(0.65, 0.55, 0.45);  // Timing modifier
  const vec3 colorD = vec3(0.75, 0.85, 0.95);  // Phase shift

  // Color palette function
  vec3 palette(float t) {
    return colorA + colorB * cos(6.28318 * (colorC * t + colorD));
  }

  // Improved XOR function for smoother blending
  float SmoothXor(float a, float b, float smoothness) {
    float crossfade = smoothstep(0.5 - smoothness, 0.5 + smoothness, a);
    return mix(a, 1.0 - a, crossfade * b);
  }

  // Hash function for randomization
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  
  // Smooth noise function
  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    
    // Smoothed interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  vec4 main(vec2 pos) {
    // Normalize coordinates
    vec2 uv = pos / canvas;
    uv.y = 1.0 - uv.y;
    uv = uv - 0.5;
    uv.x *= canvas.x / canvas.y;
    
    // Store original coordinates for vignette
    vec2 ov = uv;
    
    // Create a very subtle breathing effect
    float breathFactor = 0.0;
    if (iBreath > 0.0) {
      breathFactor = sin(iBreath * 3.14159);
      // Apply cubic easing for smoother transitions
      breathFactor = breathFactor * breathFactor * breathFactor;
      breathFactor = breathFactor * 0.5 + 0.5;
    } else {
      // Very slow automatic pulsing
      breathFactor = sin(iTime * 0.15) * 0.5 + 0.5;
    }

    // Very slow time progression
    float t = iTime * 0.15;
    
    // Extremely subtle breath influence on time
    if (iBreath > 0.0) {
      t *= mix(0.95, 1.05, breathFactor);
    }
    
    // NO ROTATION - removed as requested
    
    // Extremely subtle shift based on perlin-like noise
    float noiseScale = 0.2;
    vec2 shift = vec2(
      smoothNoise(vec2(t * 0.3, 0.0)) * 2.0 - 1.0,
      smoothNoise(vec2(0.0, t * 0.3)) * 2.0 - 1.0
    ) * noiseScale;
    
    // Apply breath influence to shift (making it even more subtle)
    if (iBreath > 0.0) {
      shift *= mix(0.8, 1.2, breathFactor);
    }
    
    // Apply the subtle shift
    uv += shift;
    
    // Grid scale with very subtle breath influence
    float scale = 7.5; // Lower scale for more visible elements
    if (iBreath > 0.0) {
      // Only 5% variation with breath
      scale = mix(7.35, 7.65, breathFactor);
    }
    
    uv *= scale;
    
    // Grid setup
    vec2 gv = fract(uv) - 0.5;
    vec2 id = floor(uv);
    
    // Initialize pattern
    float m = 0.0;
    
    // Variable morphing parameters based on position and time
    float variableMorph = smoothNoise(id * 0.1 + t * 0.1);
    
    // Grid with variable shapes
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        // Skip outer cells in low quality mode
        if (quality < 0.5 && (x != 0 || y != 0)) {
          continue;
        }
        
        vec2 offset = vec2(float(x), float(y));
        
        // Variable cell position based on id for more organic feeling
        offset += (hash21(id + offset) * 2.0 - 1.0) * 0.1;
        
        // Distance to cell center
        float d = length(gv - offset);
        
        // Create variable pulsing shapes
        float cellId = hash21(id + offset);
        
        // Variable timing for each cell
        float cellTime = t + cellId * 10.0;
        
        // Variable morphing speed
        float morphSpeed = mix(0.5, 1.5, variableMorph);
        
        // Create more varied pulsing shapes
        float shapeType = smoothNoise(id + offset + vec2(t * 0.1, t * 0.1));
        
        // Shape size with very subtle variation
        float baseSize = mix(0.15, 0.25, cellId);
        float radius = baseSize + 0.05 * sin(cellTime * morphSpeed);
        
        // Shape softness varies by cell and time
        float softness = mix(0.1, 0.3, smoothNoise(id + offset + t * 0.2));
        
        // Different shape types blend together
        float shape1 = smoothstep(radius, radius - softness, d);
        
        // Square-like shape (using max instead of length)
        float d2 = max(abs(gv.x - offset.x), abs(gv.y - offset.y));
        float shape2 = smoothstep(radius * 0.8, radius * 0.8 - softness, d2);
        
        // Blend between circle and square shapes
        float shapeMix = smoothstep(0.3, 0.7, sin(cellTime * 0.3 + cellId * 5.0) * 0.5 + 0.5);
        float finalShape = mix(shape1, shape2, shapeMix);
        
        // Apply smooth XOR for pattern with variable smoothness
        float xorSmoothness = mix(0.1, 0.3, variableMorph);
        m = SmoothXor(m, finalShape, xorSmoothness);
      }
    }
    
    // Add base color to ensure visibility
    vec3 col = vec3(0.05); // Start with minimum brightness
    
    // Apply pattern with color and variable color timing
    float colorTiming = t * 0.1 + length(uv) * 0.05 + variableMorph * 0.2;
    col += m * palette(colorTiming);
    
    // Add subtle glow in each grid cell
    float cellGlow = 0.03 / (0.1 + length(gv) * 2.0);
    col += palette(t * 0.2 + variableMorph * 0.3) * cellGlow;
    
    // Ensure minimum color level
    col = max(col, vec3(0.02));
    
    // Add extremely subtle vignette
    float vignette = smoothstep(0.7, 0.3, length(ov));
    col = mix(col * 0.7, col, vignette); // Never go too dark
    
    // Central hole for focus
    float centerHole = smoothstep(0.01, 0.05, length(ov) - 0.02);
    
    // Make center hole respond to breath with minimal variation
    if (iBreath > 0.0) {
      float holeSize = mix(0.018, 0.022, breathFactor); // Only 0.004 variation
      centerHole = smoothstep(0.01, 0.05, length(ov) - holeSize);
    }
    
    col *= centerHole;
    
    // Add very subtle central glow
    float centerGlow = 0.08 / (0.1 + length(ov) * 10.0);
    col += palette(t * 0.3) * centerGlow;
    
    // Moderate brightness boost to ensure visibility
    col *= 1.3;

    return vec4(col, 1.0);
  }
`)!;

export default source;
