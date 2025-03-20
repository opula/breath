import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform shader image;  

  uniform float2 canvas;
  uniform float iTime;

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    // uv.y = 1 - uv.y;
    // uv = uv - .5;
    // uv.x *= canvas.x / canvas.y;

    vec3 col = image.eval(pos).rgb;
    return vec4(col.r, 0., 0., 1.);
  }
`)!;
