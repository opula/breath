import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv.x *= canvas.x / canvas.y;

    vec3 finalColor = vec3(uv.x, uv.y, 0.);
    return vec4(finalColor, 1.);
  }
`)!;
