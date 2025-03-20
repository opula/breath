import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;


  float DistLine(vec3 ro, vec3 rd, vec3 p) {
    return length(cross(p-ro, rd)) / length(rd);
  }

  float DrawPoint(vec3 ro, vec3 rd, vec3 p) {
    float d = DistLine(ro, rd, p);
    d = smoothstep(.06, .05, d);
    return d;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv.x *= canvas.x / canvas.y;

    float t = iTime;

    // vec3 ro = vec3(0., 0., -3.);
    vec3 ro = vec3(sin(iTime) * 3, 0., 1 * cos(t));

    vec3 lookat = vec3(.5);
    float zoom = 1.;

    vec3 f = normalize(lookat - ro);
    vec3 r = cross(vec3(0., 1., 0.), f);
    vec3 u = cross(f, r);

    vec3 c = ro + f*zoom;
    vec3 i = c + uv.x*r + uv.y*u;

    vec3 rd = i - ro;
    // vec3 rd = vec3(uv.x, uv.y, -2.0) - ro;

    vec3 p = vec3(sin(t), 0., 1. + cos(t));
    
    float d = 0.;

    // d += DrawPoint(ro, rd, p);
    d += DrawPoint(ro, rd, vec3(0., 0., 0.));
    d += DrawPoint(ro, rd, vec3(0., 0., 1.));
    d += DrawPoint(ro, rd, vec3(0., 1., 0.));
    d += DrawPoint(ro, rd, vec3(0., 1., 1.));
    d += DrawPoint(ro, rd, vec3(1., 0., 0.));
    d += DrawPoint(ro, rd, vec3(1., 0., 1.));
    d += DrawPoint(ro, rd, vec3(1., 1., 0.));
    d += DrawPoint(ro, rd, vec3(1., 1., 1.));

    return vec4(d);
    // return vec4(0, 0, 0, 0);
  }
`)!;
