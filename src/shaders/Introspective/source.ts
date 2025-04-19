import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;
  uniform float quality; // Default to high quality if not provided

  const float PI = 3.1415;
  const float TWO_PI = PI * 2.0;

  // Subtle, muted color palette - calming tones
  const vec3 colorA = vec3(0.1, 0.1, 0.2);    // Deep muted base
  const vec3 colorB = vec3(0.3, 0.3, 0.4);    // Subtle variation
  const vec3 colorC = vec3(0.4, 0.5, 0.6);    // Gentle timing modifier
  const vec3 colorD = vec3(0.2, 0.3, 0.5);    // Soft phase shift

  // Second palette for subtle breath transitions
  const vec3 colorA2 = vec3(0.12, 0.1, 0.18);  // Very close to first palette
  const vec3 colorB2 = vec3(0.35, 0.3, 0.45);  // Slight shift toward purple
  const vec3 colorC2 = vec3(0.38, 0.5, 0.65);  // Slight timing variation
  const vec3 colorD2 = vec3(0.22, 0.3, 0.48);  // Slight phase variation

  vec3 palette(float t, float breathFactor) {
    // Very subtle interpolation between palettes
    vec3 a = mix(colorA, colorA2, breathFactor);
    vec3 b = mix(colorB, colorB2, breathFactor);
    vec3 c = mix(colorC, colorC2, breathFactor);
    vec3 d = mix(colorD, colorD2, breathFactor);
    
    return a + b * cos(TWO_PI * (c * t + d));
  }

  // Optimized 2D hash function
  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
  }

  // Optimized noise function
  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Smoother interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);

    // Four corner samples
    float a = dot(hash(i), f - vec2(0.0, 0.0));
    float b = dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    // Interpolate
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.5 + 0.5;
  }
  
  // Soft ridged noise for gentle tunnel textures
  float softRidgedNoise(vec2 p) {
    float n = noise(p);
    // Less harsh than absolute value - creates smoother transitions
    return 1.0 - smoothstep(0.3, 0.7, n);
  }
  
  // Fractal noise with very gradual detail changes
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    
    // Limit octaves for smoother appearance
    int octaves = quality > 0.5 ? 3 : 2;
    
    for (int i = 0; i < 3; i++) {
      if (i >= octaves) break;
      
      // Use softRidgedNoise for smoother patterns
      sum += amp * softRidgedNoise(p * freq);
      
      // Gentler amplitude falloff
      amp *= 0.6;
      // Gentler frequency increase
      freq *= 1.8;
      
      // Subtle coordinate rotation
      p = vec2(p.y * 0.6 - p.x * 0.6, p.x * 0.6 + p.y * 0.6);
    }
    
    return sum;
  }
  
  // Very subtle flowing bands
  float smoothBands(float r, float t) {
    // Use cosine instead of sine for smoother transitions
    float bands = cos(r * 8.0 - t * 1.0) * 0.5 + 0.5;
    // Soften the bands significantly
    bands = smoothstep(0.3, 0.7, bands);
    return bands;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1.0 - uv.y;
    uv = uv - 0.5;
    uv.x *= canvas.x / canvas.y;

    // Store original coordinates for vignette
    vec2 ov = uv;

    // Gentler scaling for less intense perspective
    uv *= 1.6;
    
    // Calculate breath influence
    float breathFactor = 0.0;
    if (iBreath > 0.0) {
      // Smooth breath factor - very gentle cubic easing for smoother transitions
      breathFactor = sin(iBreath * PI);
      breathFactor = breathFactor * breathFactor * breathFactor;
      breathFactor = breathFactor * 0.5 + 0.5;
    } else {
      // Extremely slow automatic pulsing if no breath input
      breathFactor = sin(iTime * 0.1) * 0.5 + 0.5;
    }
    
    // Very slow base animation speed
    float baseSpeed = 0.1;
    float t = iTime * baseSpeed;
    
    // Subtle breath-influenced movement
    if (iBreath > 0.0) {
      // Minimal vertical movement
      float breathMovement = sin(iBreath * PI) * 0.2;
      uv.y += breathMovement;
      
      // Gentle speed adjustment
      float speedFactor = mix(0.85, 1.15, breathFactor);
      t *= speedFactor;
    }

    // Calculate polar coordinates
    float arc = atan(uv.y, uv.x);
    float rad = length(uv);
    
    // Inverse radius for tunnel effect
    float invRad = 1.0 / max(rad, 0.001);
    
    // Extremely subtle breath-influenced distortion
    if (iBreath > 0.0) {
      // Almost imperceptible radius variation
      rad *= mix(0.95, 1.05, breathFactor);
    }

    // Create tunnel coordinates with slower movement
    vec2 tunnelUV = vec2(arc / TWO_PI + t * 0.05, invRad + t * 0.25);
    
    // Generate tunnel pattern
    float pattern = fbm(tunnelUV);
    
    // Add very subtle flowing bands
    float bands = smoothBands(invRad, t);
    
    // Gentle blending of patterns - mostly noise
    pattern = mix(pattern, bands, 0.15);
    
    // Ensure pattern is in good range with gentle contrast
    pattern = pattern * 0.6 + 0.4; // Reduced contrast
    
    // Apply color palette with minimal breath influence
    vec3 col = palette(t * 0.1 + rad * 0.2, breathFactor) * pattern;
    
    // Subtle depth gradient
    col *= mix(0.6, 2.0, 1.0 / (1.0 + rad * 6.0));
    
    // Very subtle pulsing
    float pulse = 1.0;
    if (iBreath > 0.0) {
      pulse = mix(0.95, 1.05, breathFactor);
    } else {
      pulse = 1.0 + 0.03 * sin(t * 0.5);
    }
    col *= pulse;
    
    // Add gentle central glow
    float glow = 0.8 / (1.0 + rad * 20.0);
    col += palette(t * 0.1, breathFactor) * glow * 0.2;

    // Add the fade in the middle with minimal breath responsiveness
    float centerFade = smoothstep(0.01, 0.35, length(ov) - 0.02);
    
    // Subtle hole size response
    if (iBreath > 0.0) {
      float holeSize = mix(0.02, 0.03, breathFactor);
      centerFade = smoothstep(0.01, 0.35, length(ov) - holeSize);
    }
    
    col *= vec3(centerFade);
    
    // Ensure minimum brightness
    col = max(col, vec3(0.03));

    return vec4(col, 1.0);
  }
`)!;

export default source;
