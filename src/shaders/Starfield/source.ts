import { Skia } from "@shopify/react-native-skia";

export const source = Skia.RuntimeEffect.Make(`
  uniform float2 canvas;
  uniform float iTime;
  uniform float iBreath;
  const float quality = 1.0;

  const float TAU = 6.28318;
  const float PI = 3.141592;
  
  // Fixed number of layers - we'll skip some based on quality
  const float NUM_LAYERS = 6.0;
  const float LAYER_INCREMENT = 1.0/NUM_LAYERS;
  
  float StarGlow = 0.025;
  float StarSize = 2.0;
  float CanvasView = 20.0;
  
  // Base velocity and breath modulation
  float BaseVelocity = 0.025;

  vec3 palette(float t) {
    vec3 a = vec3(0.540, 0.288, 0.458);
    vec3 b = vec3(0.408, 0.944, 0.494);
    vec3 c = vec3(1.261, 0.029, 0.330);
    vec3 d = vec3(3.467, 6.147, 5.086);
    
    return a + b*cos(TAU*(c*t+d));
  }

  // Optimized star function
  float Star(vec2 uv, float flare) {
    float d = length(uv);
    float m = sin(StarGlow * 1.2) / d;
    
    // Skip ray calculation in low quality mode
    if (quality > 0.3) {
      float rays = max(0.0, 0.5 - abs(uv.x * uv.y * 1000.0));
      m += (rays * flare) * 2.0;
    }
    
    m *= smoothstep(1.0, 0.1, d);
    return m;
  }

  // Optimized hash function
  float Hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Optimized star layer
  vec3 StarLayer(vec2 uv, float breathFactor) {
    vec3 col = vec3(0.0);
    vec2 gv = fract(uv);
    vec2 id = floor(uv);
    
    // Determine search range based on quality
    int range = quality > 0.5 ? 1 : 0;
    
    for (int y = -1; y <= 1; y++) {
      if (float(y) < -float(range) || float(y) > float(range)) continue;
      
      for (int x = -1; x <= 1; x++) {
        if (float(x) < -float(range) || float(x) > float(range)) continue;
        
        vec2 offs = vec2(float(x), float(y));
        float n = Hash21(id + offs);
        float size = fract(n);
        
        // Add slight breath influence to star size when breathing
        if (iBreath > 0.0) {
          // Use subtle influence - 10% max variation
          size *= 0.95 + 0.1 * breathFactor;
        }
        
        vec2 p1 = gv - offs - vec2(n, fract(n * 34.0)) + 0.5;
        float p2 = smoothstep(0.1, 0.9, size) * 0.46;
        float star = Star(p1, p2);
        
        // Generate star color with palette
        vec3 color = sin(vec3(0.2, 0.3, 0.9) * fract(n * 2345.2) * TAU) * 0.25 + 0.75;
        vec3 mixture = palette(iTime * 0.1);
        color = color * vec3(0.45, 0.39, 0.9 + size) * mixture;
        color += 0.2;
        
        // Apply breathing to star pulsation if available
        float pulsation;
        if (iBreath > 0.0) {
          // Star pulsation influenced by breath - subtler with smoother transitions
          pulsation = 0.7 + 0.3 * sin(breathFactor * TAU + n * PI);
        } else {
          pulsation = sin(iTime * 0.6 + n * TAU) * 0.5 + 0.5;
        }
        
        star *= pulsation;
        col += star * size * color;
      }
    }
    
    return col;
  }

  vec4 main(vec2 pos) {
    vec2 uv = pos / canvas;
    uv.y = 1.0 - uv.y;
    uv = uv - 0.5;
    uv = uv * 2.0;
    uv.x *= canvas.x / canvas.y;

    // Calculate mouse/motion offset
    vec2 M = vec2(0.0);
    M -= vec2(M.x + sin(iTime * 0.22), M.y - cos(iTime * 0.22));
    
    // Calculate breathing influence
    float breathFactor = 0.0;
    float velocity = BaseVelocity;
    
    if (iBreath > 0.0) {
      // Smooth breath factor (avoid harsh transitions)
      breathFactor = sin(iBreath * PI) * 0.5 + 0.5;
      
      // Modulate velocity with breath - subtle effect
      // Faster on inhale, slower on exhale (natural feeling)
      velocity = mix(BaseVelocity * 0.7, BaseVelocity * 1.3, breathFactor);
    }
    
    // Time advancement based on velocity
    float t = iTime * velocity;
    
    // Accumulate star layers with fixed increment
    vec3 col = vec3(0.0);
    
    // Calculate minimum quality threshold for rendering each layer
    float qualityThreshold = 1.0 / NUM_LAYERS;
    
    for (float i = 0.0; i < 1.0; i += LAYER_INCREMENT) {
      // Skip this layer if quality is too low
      // First layer is always rendered, others depend on quality
      if (i > 0.0 && i > quality) {
        continue;
      }
      
      float depth = fract(i + t);
      float scale = mix(CanvasView, 0.5, depth);
      
      // Adjust scale subtly based on breath if available
      if (iBreath > 0.0) {
        // 5% max variation in scale - subtle but noticeable
        scale *= mix(0.95, 1.05, breathFactor);
      }
      
      float fade = depth * smoothstep(1.0, 0.9, depth);
      col += StarLayer(uv * scale + i * 453.2 - iTime * 0.05 + M, breathFactor) * fade;
    }
    
    // Add subtle blue tint for distance fog effect in higher quality
    if (quality > 0.7) {
      vec3 fogColor = vec3(0.1, 0.2, 0.4) * palette(iTime * 0.05);
      float fogAmount = 0.1 * (1.0 - exp(-length(uv) * 0.5));
      col += fogColor * fogAmount;
    }
    
    // Add the fade in the middle - with breath responsiveness
    float centerFade = smoothstep(0.01, 0.25, length(uv) - 0.02);
    
    // Add subtle expansion/contraction to the center hole based on breath
    if (iBreath > 0.0) {
      // Make center hole expand slightly during inhale (10% max variation)
      float breathInfluence = mix(0.95, 1.05, breathFactor);
      centerFade = smoothstep(0.01, 0.25 * breathInfluence, length(uv) - 0.02);
    }
    
    col *= vec3(centerFade);
    
    // Add subtle overall brightness pulsation with breath
    if (iBreath > 0.0) {
      // Very subtle - max 10% variation
      float brightnessModulation = 0.95 + 0.1 * breathFactor;
      col *= brightnessModulation;
    }

    return vec4(col, 1.0);
  }
`)!;

export default source;
