import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;

  float hash(vec2 a) {
    return fract(sin(a.x * 3433.8 + a.y * 3843.98) * 45933.8 + (iTime * .5));
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv.x *= canvas.x / canvas.y;

    float d = length(uv);
    float r = iBreath * .5;
    r = mix(.25, .4, r * 2.);

    vec3 col = vec3(smoothstep(d-.03, d, r));
    col = mix(col, vec3(0.), smoothstep(d - (max(.8*r, .2)), d, r-.1));

    vec3 col2 = mix(col, vec3(0.), pow(hash(uv), 4.));
    col2 *= .5;

    col = mix(col, col2, .2);

    return vec4(col, col.x * col.y);
  }
`)!;
