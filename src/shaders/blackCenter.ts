import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;

  vec4 main(vec2 pos) {
    pos.y = canvas.y-pos.y;
    vec2 uv = (pos - .5 * canvas.xy)/canvas.y;

    float d = length(uv);
    vec3 col = vec3(0., 0., 0.);

    vec4 finalColor = vec4(vec3(0.), smoothstep(.6, .05, d));

    return finalColor;
  }
`)!;
