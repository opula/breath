import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float bgTime;

  vec3 palette( float t) {
    vec3 a = vec3(0.540, 0.288, 0.458);
    vec3 b = vec3(0.408, 0.944, 0.494);
    vec3 c = vec3(1.261, 0.029, 0.330);
    vec3 d = vec3(3.467, 6.147, 5.086);
    
    return a + b*cos( 6.28318*(c*t+d) );
  }

  float lerpBetweenBands(float value, float lowBand, float highBand, float newLowBand, float newHighBand) {
    float t = (value - lowBand) / (highBand - lowBand);
    return newLowBand * (1.0 - t) + newHighBand * t;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv = uv * 2.;
    uv.x *= canvas.x / canvas.y;

    float d = length(uv);
    d -= .504 * (1+ sin(iTime / 10));
    d = abs(d);
    // d *= (sin(iTime / 100) + 1) * .2;
    // d *= length(uv) + (sin(iTime/10) + 1) * .2;
    
    // d = lerpBetweenBands(d, 0, 1, .5, 0);
    vec3 col = vec3(d);

    // col = mix(col, vec3(1.), smoothstep(.1, .3, 1-d));
    // vec3 mixture = palette(bgTime / 10);
    // col *= mixture;

    return vec4(col, 1.0);
  }
`)!;
