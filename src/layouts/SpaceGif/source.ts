import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;

  // Adjusted colors to stay within standard ranges
  const vec3 colorA = vec3(0.247, 0.573, 0.600);
  const vec3 colorB = vec3(0.511, 0.432, 0.359);
  const vec3 colorC = vec3(0.769, 0.569, 0.467);
  const vec3 colorD = vec3(0.133, 0.229, 0.457);

  // Improved XOR function with smoother blending
  float smoothXor(float a, float b) {
    return max(min(a, 1.0-b), min(b, 1.0-a));
  }

  vec3 palette(float t) {
    return colorA + colorB * cos(6.28318 * (colorC * t + colorD));
  }

  vec4 main(vec2 pos) {
    // Return immediately with a bright color if canvas sizes are invalid
    if (canvas.x < 1.0 || canvas.y < 1.0) {
      return vec4(1.0, 0.0, 0.0, 1.0); // Bright red for debugging
    }
    
    // Normalized coordinates with flipped Y (consistent with other shaders)
    vec2 uv = pos / canvas;
    uv.y = 1.0 - uv.y; // Flip Y to match other shaders
    uv = uv - 0.5;
    uv.x *= canvas.x / canvas.y; // Aspect ratio correction (consistent with other shaders)
    
    // Store original uv for vignette effect
    vec2 ov = uv;
    
    // Initial color - ensure it has some minimal value
    vec3 col = vec3(0.05);
    
    // Rotation - simplified and using proper radians
    float angle = iTime * 0.2;
    float s = sin(angle);
    float c = cos(angle);
    uv = uv * mat2(c, -s, s, c);
    
    // Dynamic zoom based on breathing - clamped for stability
    float zoom = 20.0 + 10.0 * sin(iTime * 0.1) + max(0.0, min(1.0, 1.0 - iBreath)) * 15.0;
    uv *= zoom;
    
    // Grid setup
    vec2 gv = fract(uv) - 0.5;
    vec2 id = floor(uv);
    
    // Initialize pattern variable
    float m = 0.0;
    float t = iTime * 0.33;
    
    // Create circular pattern - using step increment for better performance
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      for (float x = -1.0; x <= 1.0; x += 1.0) {
        vec2 offset = vec2(x, y);
        float d = length(gv - offset);
        
        // Create pulsing circles
        float dist = length(id + offset) * 0.15;
        float radius = mix(0.2, 0.6, 0.5 + 0.5 * sin(dist - t * 2.0));
        
        // Apply smooth XOR for pattern
        m = smoothXor(m, smoothstep(radius, radius * 0.7, d));
      }
    }
    
    // Apply color using palette
    col += m * palette(t * 0.1 + length(uv) * 0.05);
    
    // Ensure minimum brightness
    col = max(col, vec3(0.05, 0.05, 0.1));
    
    // Add center vignette/hole effect - using values similar to Tunnel shader
    float centerDist = length(ov);
    float vignette = smoothstep(0.01, 0.35, centerDist - 0.02);
    col *= vignette;
    
    // Add subtle pulsing glow to the entire effect
    float glow = 1.0 + 0.2 * sin(iTime * 0.5);
    col *= glow;
    
    return vec4(col, 1.0);
  }
`)!;
