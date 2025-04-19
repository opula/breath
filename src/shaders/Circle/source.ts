import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;  // Added iBreath uniform to use breathing input
  uniform float quality;  // Added quality uniform for performance control (0.0-1.0)

  // Enhanced color palette with more soothing colors for breathwork
  vec3 palette(float t) {
    vec3 a = vec3(0.540, 0.288, 0.458);
    vec3 b = vec3(0.408, 0.944, 0.494);
    vec3 c = vec3(1.261, 0.029, 0.330);
    vec3 d = vec3(3.467, 6.147, 5.086);
    
    return a + b*cos(6.28318*(c*t+d));
  }

  // Simple but efficient noise function for texture
  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    // Simplified noise calculation for better performance
    f = f*f*(3.0-2.0*f);
    
    float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453);
    float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
    float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1.0 - uv.y;
    uv = uv - 0.5;
    uv = uv * 2.0;
    uv.x *= canvas.x / canvas.y;

    // Store original uv for vignette effect
    vec2 originalUv = uv;
    
    // Calculate distance from center
    float d = length(uv);
    
    // Use breath input for circle size if available, otherwise fallback to time-based animation
    float breathEffect = iBreath > 0.0 ? 
                        mix(0.3, 0.8, (sin(iBreath * 3.14159 * 2.0) * 0.5 + 0.5)) : 
                        0.504 * (1.0 + sin(iTime / 10.0));
    
    d -= breathEffect;
    d = abs(d);
    
    // Add subtle noise texture based on quality setting
    float noiseAmount = quality > 0.5 ? 0.05 : 0.02;
    float noiseScale = quality > 0.5 ? 5.0 : 3.0;
    
    if (quality > 0.0) {
      float noiseValue = noise(uv * noiseScale + iTime * 0.1) * noiseAmount;
      d += noiseValue;
    }
    
    // Create color gradient based on distance
    vec3 inhaleColor = palette(iTime * 0.05);
    vec3 exhaleColor = palette(iTime * 0.05 + 0.5);
    
    // Mix colors based on breath phase or time
    float breathPhase = iBreath > 0.0 ? 
                        (sin(iBreath * 3.14159) * 0.5 + 0.5) : 
                        (sin(iTime * 0.2) * 0.5 + 0.5);
    
    vec3 col = mix(exhaleColor, inhaleColor, breathPhase);
    
    // Apply distance to color (darker in the middle, brighter at the edge)
    col *= smoothstep(0.0, 0.5, d);
    
    // Add pulsing glow effect
    float glow = 0.05 * (sin(iTime * 0.5) * 0.5 + 0.5);
    col += glow * vec3(1.0, 0.8, 0.9) * (1.0 - d);
    
    // Create vignette effect (fade out at edges)
    float vignette = smoothstep(1.2, 0.5, length(originalUv));
    col *= vignette;
    
    // Ensure minimum brightness
    col = max(col, vec3(0.02));
    
    return vec4(col, 1.0);
  }
`)!;

export default source;
