import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;

  const float quality = 1.0;

  const vec3 skyColor1 = vec3(0.2, 0.0, 0.4);
  const vec3 skyColor2 = vec3(0.15, 0.2, 0.35);

  // Simple hash function
  float hash(float n) {
    return fract(sin(n) * 43758.5453);
  }

  // Noise 2D
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash(i.x + hash(i.y)), hash(i.x + 1.0 + hash(i.y)), u.x),
      mix(hash(i.x + hash(i.y + 1.0)), hash(i.x + 1.0 + hash(i.y + 1.0)), u.x),
      u.y
    );
  }

  vec3 auroraLayer(vec2 uv, float speed, float intensity, vec3 color) {
    float t = iTime * speed;
    vec2 scaleXY = vec2(2.0);
    vec2 movement = vec2(2.0, -2.0);
    vec2 p = uv * scaleXY + t * movement;
    float n = noise(p + noise(color.xy + p + t));
    float aurora = smoothstep(0.0, 0.2, n - uv.y) * (1.0 - smoothstep(0.0, 0.6, n - uv.y));

    return aurora * intensity * color;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    vec2 gv = uv;
    gv -= .5;
    
    uv.x *= canvas.x / canvas.y;
    gv.x *= canvas.x / canvas.y;

    // Create multiple aurora layers with varying colors, speeds, and intensities
    vec3 color = vec3(0.0);
    color += auroraLayer(uv, 0.05, 0.3, vec3(0.0, 0.2, 0.3));
    color += auroraLayer(uv, 0.1, 0.4, vec3(0.1, 0.5, 0.9));
    color += auroraLayer(uv, 0.15, 0.3, vec3(0.2, 0.1, 0.8));
    color += auroraLayer(uv, 0.07, 0.2, vec3(0.2, 0.1, 0.6));

    color += skyColor2 * (1.0 - smoothstep(0.0, 2.0, uv.y));
    color += skyColor1 * (1.0 - smoothstep(0.0, 1.0, uv.y));

    // Add the fade in the middle
    float middle = (smoothstep(.25, .001, length(gv)) + .5) * .7;
    middle = 1- clamp(middle, 0., 1.) * .3;
    middle = pow(middle, 3.5);
    color *= vec3(middle);

    return vec4(color, 1.);
  }
`)!;
