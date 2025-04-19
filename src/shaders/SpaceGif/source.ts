import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;

  const float quality = 1.0;

  const vec3 colorA = vec3(0.247, 0.573, .6);
  const vec3 colorB = vec3(.911, .432, .359);
  const vec3 colorC = vec3(1.069, .769, .467);
  const vec3 colorD = vec3(1.133, 4.229, 3.457);

  float Xor(float a, float b) {
    return a*(1.-b) + b*(1.-a);
  }

  vec3 palette( float t) {
    // vec3 a = vec3(0.540, 0.288, 0.458);
    // vec3 b = vec3(0.408, 0.944, 0.494);
    // vec3 c = vec3(1.261, 0.029, 0.330);
    // vec3 d = vec3(3.467, 6.147, 5.086);
    vec3 a = colorA;
    vec3 b = colorB;
    vec3 c = colorC;
    vec3 d = colorD;
    
    return a + b*cos( 6.28318*(c*t+d) );
  }

  vec4 main(vec2 pos) {
    pos.y = canvas.y-pos.y;
    vec2 uv = (pos - .5 * canvas.xy)/canvas.y;

    // Setup center distance for our fade from center
    vec2 ov = uv;
    
    // initial color
    vec3 col = vec3(0.);

    // Rotate work
    float a = (iTime * .5 * 3.14) / 180;
    float s = sin(a);
    float c = cos(a);
    uv *= mat2(c, -s, s, c);
    

    // Zoom in and out
    // uv *= 20. * (sin(iTime * .1)*.5+.5*5.);
    uv *= 50. + ((1.-iBreath) / 10. * 150.);
    
    // Setup local fraction
    vec2 gv = fract(uv) - .5;
    
    // Create id of fraction
    vec2 id = floor(uv);

    // Set initial m and time;
    float m = 0.;
    float t = iTime * .33;

    for (float y=-1.; y<=1; y++) {
      for (float x=-1.; x<=1; x++) {
        vec2 offs = vec2(x, y);

        float d = length(gv-offs);
        // float distMix = mix(id, gv, sin(t));
        float dist = length(id+offs) * .1;

        float r = mix(.1, 1.2, sin(dist-t)*.5+.5);
        m = Xor(m, smoothstep(r, r * .7, d));
      }
    }

    // Add the work from the loop
    col += m;

    // Add the color palette
    col *= palette((t + length(uv)/8) * .05);
    
    // Add the fade in the middle
    col *= vec3(smoothstep(.01, .25, length(ov) - .02));

    return vec4(col, 1.);
  }
`)!;
