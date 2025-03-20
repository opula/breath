import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float clock;

  const float4 black = float4(0, 0, 0, 1);  

  vec4 main(vec2 xy) {
    float2 center = canvas / 2.0;
    
    float2 uv = (120.0 * ((xy - canvas / 2.0) / canvas.y) + float2(0, 0)) * .8;
    float time = clock * .0003;
    // uv = floor(uv);
    uv = floor(uv) + smoothstep(0.0, .3, fract(uv));
    uv = uv / (2.5 + time * .001);

    // float d = 1.0;
    float d = 1.0 + sqrt(length(uv)) / 109.0;
    float t = 10.0 + time + 200;
    float value = d * t + (t * 1.125) * cos(uv.x) * cos(uv.y);
    float color = sin(value) * 3.0;

    float low = abs(color);
    float med = abs(color) - 1.0;
    float high = abs(color) - 1.5;

    float4 lifeColor;

    if (color > 0.0) {
      lifeColor = float4(high, high, med, 1.0);
    } else {
      lifeColor = float4(med, high, high, 1.0);
    }

    return lifeColor * 1.1;
  }
`)!;
