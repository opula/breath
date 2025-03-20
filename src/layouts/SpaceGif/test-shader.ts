import { Skia } from "@shopify/react-native-skia";

// Super simple shader that just creates a gradient
export const testSource = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;
  
  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    
    // Create a simple gradient
    vec3 color = vec3(uv.x, uv.y, 0.5 + 0.5 * sin(iTime));
    
    // Add breathing effect
    float breathEffect = iBreath * 0.5;
    color = mix(color, vec3(1.0, 1.0, 1.0), breathEffect);
    
    return vec4(color, 1.0);
  }
`)!;