import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform shader image;  

  uniform float2 canvas;
  uniform float iTime;

  const float mult = 12.;

  vec4 main(vec2 pos) {
    // vec2 uv = pos / canvas;
    // uv.y = 1 - uv.y;
    // uv = uv - .5;
    // uv.x *= canvas.x / canvas.y;
    vec2 uv = pos / canvas;
    uv -= .5;
    uv.x *= canvas.x/canvas.y;
    uv.y *= -1.;

    float ratio = canvas.x / canvas.y;
    
    uv *= mult;
    vec2 gv = fract(uv) - .5;

    // Create id of fraction
    vec2 id = floor(uv);

    float d = length(gv);
    float r = .5;
    float m = smoothstep(r, r - .1, d);

    vec3 col = vec3(0.);
    // col += mod(id.x+id.y, 59) == 0 ? m : 0.;
    // col += mod(id.x-id.y, 59) == 0 ? m : 0.;
    col += id.y == 5. ? m : 0.;
    col += id.y == -27. ? m : 0.;
    col += id.x == -48. ? m : 0.;
    col += id.x == 5. ? m : 0.;

    return vec4(col, 1.0);
  }
`)!;
