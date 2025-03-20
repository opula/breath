import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;

  float S(float a, float b, float t) {
    return smoothstep(a, b, t);
  }

  float sat(float x) {
    return clamp(x, 0., 1.);
  }

  float remap01(float a, float b, float t) {
    return sat((t-a)/(b-a));
  }
  
  float remap(float a, float b, float c, float d, float t) {
    return sat((t-a)/(b-a)) * (d-c) + c;
  }

  vec4 Head(vec2 uv) {
    vec4 col = vec4(.9, .65, .1, 1.);
    float d = length(uv);

    col.a = S(.5, .49, d);

    float edgeShade = remap01(.35, .5, d);
    edgeShade *= edgeShade;

    col.rgb *= 1. - edgeShade *.5;

    col.rgb = mix(col.rgb, vec3(.6, .3, .1), S(.47, .48, d));

    float highlight = S(.41, .405, d);
    highlight *= remap(.41, -.1, .75, .0, uv.y);
    col.rgb = mix(col.rgb, vec3(1.), highlight);

    return col;
  }

  vec4 Smiley(vec2 uv) {
    vec4 col = vec4(.0);

    vec4 head = Head(uv);

    col = mix(col, head, head.a);

    return col;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv -= .5;
    uv.x *= canvas.x/canvas.y;
    uv.y *= -1.;

    return Smiley(uv);
   }
`)!;

// export const source = Skia.RuntimeEffect.Make(`
//   uniform float2 canvas;
//   uniform float iTime;

//   float remap01(float a, float b, float t) {
//     return (t-a) / (b-a);
//   }

//   float remap(float a, float b, float c, float d, float t) {
//     return remap01(a, b, t) * (d-c) + c;
//   }

//   float Band(float t, float start, float end, float blur ) {
//     float step1 = smoothstep(start-blur, start+blur, t);
//     float step2 = smoothstep(end+blur, end-blur, t);

//     return step1 * step2;
//   }

//   float Rectange(vec2 uv, float left, float right, float bottom, float top, float blur) {
//     float band1 = Band(uv.x, left, right, blur);
//     float band2 = Band(uv.y, bottom, top, blur);

//     return band1 * band2;
//   }

//   vec4 main(vec2 pos) {
//     vec2 uv = pos / canvas;
//     uv -= .5;
//     uv.x *= canvas.x/canvas.y;
//     uv.y *= -1.;
//     float t = iTime / 1000.;

//     float x = uv.x;
//     // float m = sin(t + x * 8.) * .1;
//     float m = 0.;
//     float y = uv.y - m;
//     float blur = remap(-.5, .5, .25, .1, x);
//     float height = remap(0, 1, .2, .5, sin(t));

//     // x += y*.2;
//     float mask = Rectange(vec2(x,y), -0.5, 0.5, -height, height, blur);
//     vec3 col = vec3(1.0) * mask;

//     return vec4(vec3(col), 1.0);
//   }
// `)!;
