import {Skia} from '@shopify/react-native-skia';

const COS_GRADIENTS =
  // '[[0.127 0.109 0.412] [0.509 0.964 0.321] [1.384 1.148 1.198] [0.879 4.170 1.251]]';
  // '[[0.544 0.224 0.648] [0.586 0.186 0.780] [0.035 1.534 0.032] [3.186 5.081 1.637]]';
  // '[[0.000 0.500 0.500] [0.000 0.500 0.500] [0.000 0.500 0.333] [0.000 0.500 0.667]]';
  // '[[0.000 0.500 0.500] [0.000 0.500 0.500] [0.000 0.500 0.333] [0.000 0.500 0.667]]';
  '[[0.338 0.558 0.728] [0.068 0.500 0.500] [-0.682 0.500 0.458] [-0.652 0.508 0.718]]';

// Remove the outer brackets and split the string into rows
const rows = COS_GRADIENTS.slice(1, -1).split('] [');

// Split each row into columns and parse the values as floats
const gradient = rows.map(row =>
  row
    .slice(1, -1)
    .split(' ')
    .map(value => parseFloat(value)),
);

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;

  const vec3 colorA = vec3(${gradient[0][0]}, ${gradient[0][1]}, ${gradient[0][2]});
  const vec3 colorB = vec3(${gradient[1][0]}, ${gradient[1][1]}, ${gradient[1][2]});
  const vec3 colorC = vec3(${gradient[2][0]}, ${gradient[2][1]}, ${gradient[2][2]});
  const vec3 colorD = vec3(${gradient[3][0]}, ${gradient[3][1]}, ${gradient[3][2]});


  vec3 palette(float t) {
    vec3 a = colorA;
    vec3 b = colorB;
    vec3 c = colorC;
    vec3 d = colorD;
    
    return a + b*cos( 6.28318*(c*t+d) );
  }

  float rand(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * (iTime * .1));
  }

  float grid(vec2 uv, float scale, float thickness) {
    vec2 g2 = smoothstep(0., 1.5 * scale / canvas.y, abs(fract(uv + .5) - .5) - thickness / 2.);

    return min(g2.x, g2.y);
  }

  float randomGrid(vec2 uv, float scale) {
    uv *= scale;
    float g = grid(uv, scale, .2);
    return rand(floor(uv) / scale) * g;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv.x *= canvas.x / canvas.y;

    // Setup center distance for our fade from center
    vec2 ov = uv;

    // uv.y -= .01 * iTime;
    float t = .005 * iTime;
    uv.y -= 3. * cos(t) - 5. * cos(2 * t) - 2.0 * cos(3.0 * t) - cos(4. * t);
    uv.x -= 4. * sin(t) * sin(t) * sin(t);

    float scale = 35.;
    float v = randomGrid(uv, scale);
    vec3 c1 = vec3(.2);
    vec3 c2 = vec3(.2, .6, 1.2);
    
    // c2 *= palette(((iTime * .3) + uv.y*5. * -1.) * .1);

    vec3 finalColor = mix(c1, c2, v);
    
    // Add the fade in the middle
    finalColor *= vec3(smoothstep(.01, .35, length(ov) - .02));

    return vec4(finalColor, 1.);
  }
`)!;
