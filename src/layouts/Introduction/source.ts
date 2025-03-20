import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;

  vec3 palette( float t) {
    vec3 a = vec3(0.540, 0.288, 0.458);
    vec3 b = vec3(0.408, 0.944, 0.494);
    vec3 c = vec3(1.261, 0.029, 0.330);
    vec3 d = vec3(3.467, 6.147, 5.086);
    
    return a + b*cos( 6.28318*(c*t+d) );
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv = uv * 2.;
    uv.x *= canvas.x / canvas.y;

    vec2 uv0 = uv;
    vec3 finalColor = vec3(0.);

    for (float i = 0.0; i < 4.0; i++) {
      uv = fract(uv * 1.5) - .5;
      
      float d = length(uv) * exp(-length(uv0));

      vec3 col = palette(length(uv0) + i * .4 + iTime*.4);

      d = sin(d*8. + iTime) / 8.;
      d = abs(d);

      d = pow(.005 / d, 1.5);
      
      finalColor += col * d;
    }

    return vec4(finalColor, 1.0);
  }
`)!;
