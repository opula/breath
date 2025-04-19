import { Skia } from "@shopify/react-native-skia";

// --- Create Skia RuntimeEffect for Pixelated Symmetrical GoL ---
export const source = Skia.RuntimeEffect.Make(`
  // Uniforms provided by Skia/Host
  uniform float2 canvas; // Resolution (width, height)
  uniform float iTime;  // Time in seconds

  // --- Grid & Pattern Parameters ---
  const vec2 gridSize = vec2(80.0, 60.0); // Adjust grid resolution (higher = smaller pixels)
  const vec3 colorDead = vec3(0.1, 0.08, 0.12); // Dark background (matches image better)
  const vec3 colorAlive = vec3(0.85, 0.9, 0.8); // Off-white/pale green 'alive' color

  const float noiseScale = 8.0;      // Scale of the underlying noise pattern
  const float timeScale = 0.055;      // Speed of evolution
  const float neighborInfluence = 0.5; // How much neighbors affect the threshold (0 to 1)

  // --- Thresholds (operate on noise value roughly [-0.5, 0.5]) ---
  const float baseAliveThreshold = 0.1; // Base noise value needed to be considered potentially alive
  // The final threshold will be: baseAliveThreshold + neighborInfluence * (0.5 - avgNeighborNoise)
  // Meaning: if neighbors are ON (high noise avg), threshold goes DOWN (easier to be ON).
  //          if neighbors are OFF(low noise avg), threshold goes UP (harder to be ON).

  // --- Noise Functions (3D Value Noise) ---
  vec3 hash3(vec3 p) { /* ... noise hash function ... */ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453123); }
  float noise3D(vec3 p) { /* ... noise function ... */ vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f); float v000 = dot(hash3(i+vec3(0,0,0)), f-vec3(0,0,0)); float v100 = dot(hash3(i+vec3(1,0,0)), f-vec3(1,0,0)); float v010 = dot(hash3(i+vec3(0,1,0)), f-vec3(0,1,0)); float v110 = dot(hash3(i+vec3(1,1,0)), f-vec3(1,1,0)); float v001 = dot(hash3(i+vec3(0,0,1)), f-vec3(0,0,1)); float v101 = dot(hash3(i+vec3(1,0,1)), f-vec3(1,0,1)); float v011 = dot(hash3(i+vec3(0,1,1)), f-vec3(0,1,1)); float v111 = dot(hash3(i+vec3(1,1,1)), f-vec3(1,1,1)); return mix(mix(mix(v000,v100,u.x), mix(v010,v110,u.x), u.y), mix(mix(v001,v101,u.x), mix(v011,v111,u.x), u.y), u.z); }

  // Helper to get noise value for a specific CELL coordinate
  float getCellNoise(vec2 cellCoord, float time) {
      // Use cell coordinate directly for noise lookup (scaled)
      // Add small offset to avoid sampling exactly at integer boundaries
      vec2 lookupPos = (cellCoord + 0.5) / gridSize * noiseScale;
      return noise3D(vec3(lookupPos, time * timeScale)); // Noise range approx [-0.5, 0.5]
  }

  // --- Main Shader Function ---
  vec4 main(vec2 pos) {
      // --- Calculate Symmetric Grid Cell Coordinate ---
      vec2 uv = pos / canvas;
      vec2 uv_centered = uv * 2.0 - 1.0; // Center UVs
      // Aspect correction might distort grid slightly, apply carefully if needed
      // Or keep grid square relative to height:
      float aspect = canvas.x / canvas.y;
      vec2 effectiveGridSize = vec2(gridSize.y * aspect, gridSize.y); // Keep cells square-ish

      // Apply Symmetry (Quadrant Symmetry)
      vec2 symPos = abs(uv_centered);
      // Adjust symmetrical position back to 0-1 range for grid calculation
      vec2 symUV = (symPos + 1.0) * 0.5;

      // Find the integer coordinate of the cell this pixel belongs to
      vec2 cellCoord = floor(symUV * effectiveGridSize);

      // --- Calculate Center Cell Noise ---
      float centerNoise = getCellNoise(cellCoord, iTime);

      // --- Calculate Average Neighbor Noise ---
      float neighborSum = 0.0;
      int neighborCount = 0;
      for (float dx = -1.0; dx <= 1.0; dx += 1.0) {
          for (float dy = -1.0; dy <= 1.0; dy += 1.0) {
              if (dx == 0.0 && dy == 0.0) continue; // Skip center cell

              vec2 neighborCell = cellCoord + vec2(dx, dy);
              // No need to check bounds, noise function handles arbitrary coords
              neighborSum += getCellNoise(neighborCell, iTime);
              neighborCount++;
          }
      }
      float avgNeighborNoise = neighborSum / float(neighborCount); // Approx range [-0.5, 0.5]

      // --- Apply Rule: Modulate Threshold by Neighbors ---
      // If neighbors are high (avg > 0), threshold decreases.
      // If neighbors are low (avg < 0), threshold increases.
      float dynamicThreshold = baseAliveThreshold + neighborInfluence * (0.0 - avgNeighborNoise); // Center around 0 for noise range

      // --- Determine Final State (Discrete) ---
      // Is the cell's noise above the dynamically adjusted threshold?
      float finalState = step(dynamicThreshold, centerNoise); // 1.0 if alive, 0.0 if dead

      // --- Blend Colors ---
      vec3 color = mix(colorDead, colorAlive, finalState);

      // --- Output ---
      return vec4(color, 1.0);
  }
`)!;

// Optional: Export the source
// export { source };
