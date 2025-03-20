import {Skia} from '@shopify/react-native-skia';

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;

  const float NUM_LAYERS = 6.;
  const float TAU = 6.28318;
  const float PI = 3.141592;
  const float Velocity = .025; //modified value to increse or decrease speed, negative value travel backwards
  const float StarGlow = 0.025;
  const float StarSize = 02.;
  const float CanvasView = 20.;

  vec3 palette( float t) {
    vec3 a = vec3(0.540, 0.288, 0.458);
    vec3 b = vec3(0.408, 0.944, 0.494);
    vec3 c = vec3(1.261, 0.029, 0.330);
    vec3 d = vec3(3.467, 6.147, 5.086);
    
    return a + b*cos( 6.28318*(c*t+d) );
  }

  float Star(vec2 uv, float flare) {
    float d = length(uv);
    float m = sin(StarGlow * 1.2) / d;
    float rays = max(0., .5 - abs(uv.x * uv.y * 1000.));
    m += (rays * flare) * 2.;
    m *= smoothstep(1., .1, d);

    return m;
  }

  float Hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);

    return fract(p.x * p.y);
  }

  vec3 StarLayer(vec2 uv) {
    vec3 col = vec3(0.);
    vec2 gv = fract(uv);
    vec2 id = floor(uv);

    for (int y=-1; y<=1; y++) {
      for (int x=-1; x<=1; x++) {
        vec2 offs = vec2(x, y);
        float n = Hash21(id + offs);
        float size = fract(n);
        
        vec2 p1 = gv-offs-vec2(n, fract(n*34.))+.5;
        float p2 = smoothstep(.1,.9,size)*.46;
        float star = Star(p1, p2);
        
        vec3 color = sin(vec3(.2, .3, .9) * fract(n * 2345.2) * TAU) * .25 + .75;
        vec3 mixture = palette(iTime * .1);
        color = color * vec3(.45, .39, .9 + size) * mixture;
        color += .2;
        star *= sin(iTime * .6 + n * TAU) * .5 + .5;
        col += star * size * color;
      }
    }

    return col;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1 - uv.y;
    uv = uv - .5;
    uv = uv * 2.;
    uv.x *= canvas.x / canvas.y;

    vec2 M = vec2(0);

    M -= vec2(M.x + sin(iTime * .22), M.y - cos(iTime * .22));
    // M += (sin(vec2(motion)) - canvas * .5) / canvas.y;
    float t = iTime * Velocity;

    vec3 col = vec3(0.);
    for (float i = 0.; i < 1.; i += 1./NUM_LAYERS) {
      float depth = fract(i+t);
      float scale = mix(CanvasView, .5, depth);
      float fade = depth * smoothstep(1., .9, depth);
      col += StarLayer(uv * scale+i * 453.2 - iTime * .05 + M) * fade;
    }
    
    // Add the fade in the middle
    col *= vec3(smoothstep(.01, .25, length(uv) - .02));

    return  vec4(col, 1.0);
  }
`)!;
