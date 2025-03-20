import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;

  float noisev(vec2 p) {
    return fract(sin(p.x * 1234.0 + p.y * 2413.0) * 5647.0);
  }

  float noise(vec2 uv) {
    // Noise vector
    vec2 nv = vec2(0.0);
    
    // Local positions
    vec2 lv = fract(uv);
    vec2 id = floor(uv);
    
    // Interpolate lv
    lv = lv * lv * (3.0 - 2.0 * lv);
    
    // Calculate each corner
    float bl = noisev(id);
    float br = noisev(id + vec2(1, 0));
    float tl = noisev(id + vec2(0, 1));
    float tr = noisev(id + vec2(1, 1));
    
    // Interpolate values
    float b = mix(bl, br, lv.x);
    float t = mix(tl, tr, lv.x);
    float n = mix(b, t, lv.y);
    
    // Return n
    return n;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv.x *= canvas.x / canvas.y;
    uv *= 2.;

    float ratio = canvas.x/canvas.y;
    float c = 0.;
    float t = iTime * .15;
    
    vec2 p = uv;
    // p.x += 1. * ratio;
    float d = length(p);
    float dist = d;
    d = sin(d*12. - iTime * .25) / 12.;
    d = abs(d);
    d = .004 / d;
    d = mix(1., d, noise(p + iTime * .5) + .4);
    d = mix(.0, d, 1. - dist / .9);
    
    vec3 finalColor = vec3(d);
    return vec4(finalColor, 1.);
  }
`)!;
