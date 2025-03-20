import {Skia} from '@shopify/react-native-skia';

const COS_GRADIENTS =
  '[[0.000 0.500 0.500] [0.000 0.500 0.500] [0.000 0.500 0.333] [0.000 0.500 0.667]]';
const rows = COS_GRADIENTS.slice(1, -1).split('] [');
const gradient = rows.map(row =>
  row
    .slice(1, -1)
    .split(' ')
    .map(value => parseFloat(value)),
);

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;

  const float PI = 3.1415;
  const float TWO_PI = PI * 2.;

  const vec3 colorA = vec3(${gradient[0][0]}, ${gradient[0][1]}, ${gradient[0][2]});
  const vec3 colorB = vec3(${gradient[1][0]}, ${gradient[1][1]}, ${gradient[1][2]});
  const vec3 colorC = vec3(${gradient[2][0]}, ${gradient[2][1]}, ${gradient[2][2]});
  const vec3 colorD = vec3(${gradient[3][0]}, ${gradient[3][1]}, ${gradient[3][2]});

  vec3 palette(float t) {
    return colorA + colorB*cos( 6.28318*(colorC*t+colorD) );
  }
  
  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
  
    // Four corner points of a unit square
    float a = dot(hash(i), f - vec2(0.0, 0.0));
    float b = dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  
    // Interpolate between the four corner points using smoothstep
    vec2 u = smoothstep(0.0, 1.0, f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv.x *= canvas.x / canvas.y;
    
    vec2 ov = uv;

    uv *= .25;
    float t = iTime * .3;

    float arc = atan(abs(uv.y), abs(uv.x));
    float rad = length(uv);

    vec2 st = vec2(arc / TWO_PI, .5 / rad) + t;
    vec3 col = vec3(noise(st) * 7.);
    col *= palette(t + rad);
    // vec3 col = vec3(noise(st)) * palette(t);
    col *= 4. * rad;

    // Add the fade in the middle
    col *= vec3(smoothstep(.01, .35, length(ov) - .02));

    return vec4(col, 1.);
  }
`)!;
