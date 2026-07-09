# Scenes V2 — Context & Roadmap

**Purpose of this doc:** full context for the next working session. The goal there:
**design and build 10 new scenes** (drawing on what exists plus new inspiration), verify
them on-device, then **remove the old scenes** once the 10 are approved.

Written 2026-07-08 at the end of the rendering-stack upgrade + scene-experiment arc.

---

## 1. Where the codebase stands

- **Stack:** three `0.184.0` (WebGPURenderer + TSL), `react-native-webgpu 0.5.16`
  (renamed from react-native-wgpu; old name is a shim), Expo SDK 54 / RN 0.81.5
  (deliberately held for launch — react-native-webgpu's test matrix is Expo 54),
  TypeScript 5.9, typegpu 0.11.9 + @typegpu/three 0.11.0 + unplugin-typegpu (babel
  plugin wired in `babel.config.js`).
- **Typecheck is 0 errors and must stay 0.** TSL is deliberately loose-typed:
  `three/tsl` maps to `src/types/three-tsl.d.ts` (all `any`), global `TSLNode` alias
  in `src/types/tsl.d.ts`. Annotate TSL `Fn` params `[p]: [TSLNode]` and Loop
  callbacks `({ i }: { i: TSLNode })`.
- **Loose typing can't catch removed runtime exports** (e.g. `atan2` was removed from
  three's TSL — use two-arg `atan`). After any three bump, audit imports against
  `node_modules/three/build/three.tsl.js` exports (script pattern lives in git
  history; 631 exports as of 0.184).
- **Launch-critical:** `@babel/plugin-transform-class-static-block` is required in
  babel config (three ≥0.183 ships static class blocks). Cold-cache builds fail
  without it; warm caches mask it.

## 2. Scene inventory (COMPLETE 2026-07-09: registry is 11 scenes + Black)

**Current registry (all original builds, contract-compliant, verified on-sim):**
Iris (echo lineage) - Longwater (endless lineage, DEFAULT) - Lightstream (wormhole
lineage, TypeGPU) - Sea Smoke (atmosphere lineage) - Undercurrent (ethereal lineage)
- Ember Vale (magical-landscape lineage) - Stillwater (dot-water, TypeGPU) - Sundown
(vaporwave drive, TypeGPU; gradient-sky quad, magenta sun, massif ridges, horizon
fog dots, shimmering stars) - Passage (torus-gate corridor raymarch) - Isobar
(topographic contour lattice, merge-at-crest) - Seagrass (instanced GPU reed field,
MSAA). Names are placeholders until the user locks them.

**All pre-remake scenes plus Coral and the 2026-07 quartet (Open Water, First
Light, Moonrise, Ukiyo) live in `src/backgrounds/archive/`** (code preserved,
unregistered; their `../lib` imports were rewritten to `../../lib`, and `finish.ts`
moved with them). `ParticlesTG.tsx` stays in `src/backgrounds/` as the TypeGPU
reference implementation — unregistered, don't ship as a scene.
**`src/layouts/Welcome/Background.tsx` still renders the archived SinPulse** for the
splash — swapping the splash to a new scene is an open product decision.

Registry: `src/backgrounds/metadata.ts` (ids/names) + `src/layouts/Main/sources.ts`
(components). Stale persisted scene ids (including every archived id) fall back to
the default safely (`isSceneSourceId` guard + `BackgroundSurface` fallback).

## 3. Art-direction learnings (the user's actual feedback trail)

1. **Photoreal-ish derivative scenes** (Open Water/First Light/Moonrise v1):
   *"sun sparkles feel out of place and cheesy… colors too bright… scenes will never
   look photorealistic."* → glint layers deleted, palettes crushed.
2. **Muted + film grain** (chosen over cel in an A/B ask, then softened): grain good
   but *"overly done"* → `GRAIN_STRENGTH 0.024` in `finish.ts`. Moonrise: particles
   felt out of place (removed), gibbous moon terminator looked wrong (phase 0.56 ≈
   full), bloom threshold 0 washed the frame (threshold + in-shader glow instead —
   bloom was then removed entirely).
3. **Cel/toon (Ukiyo pilot)** built after: *"I'm not convinced the framerate for
   photorealistic scenes with grainy post processing will be good looking enough as
   well as performant."* The pilot proves the style commits fully and costs almost
   nothing.
4. **Standing preferences to honor in the 10:** muted/desaturated palettes, no
   glinty/sparkly effects, slow restrained motion (meditation — no motion sickness),
   nothing near pure white, subtle breath response over spectacle, full moon > phase
   terminator, grain only as a light unifier if at all.

## 4. The scene contract (every scene must match)

```tsx
export const SceneName = ({ grayscale = false, breath, onReady }: {
  grayscale?: boolean;
  breath?: SharedValue<number>;   // 0..1, 1 = fully inhaled; may be undefined (ambient)
  onReady?: () => void;           // fires after first presented frame → parent fades in
}) => { /* own <Canvas> from react-native-webgpu, single empty-deps useEffect */ }
```

- Props read via refs mutated each render (never re-run the effect).
- `makeWebGPURenderer(context, { antialias: false, /* renderScale?, dawnToggles? */ })`
  then `startWebGPUAnimationLoop(renderer, animate, { isDisposed, label, onReady,
  /* targetFps?, logFrameStats? */ })` — 30fps cap by default.
- Every `animate()`: update uniforms → `renderer.render(scene, camera)` (or pipeline
  render) → `context.present()`.
- Cleanup: `disposed = true`, `setAnimationLoop(null)`, dispose geometry/materials/
  render targets, `renderer.dispose()`.
- Grayscale: uniform, `mix(color, vec3(luma), grayscaleU)` at the very end of every
  material (Scenes previews render grayscale).
- Breath: damp raw value (`damp(current, target, rate, dt)`), clamp frame delta
  `Math.max(1/120, Math.min(elapsed - prev, 0.12))`; derive `breathMotion` energy
  from |Δbreath| with attack/release rates. Scenes must look complete with
  `breath === undefined`.
- Canonical references: `SinPulse.tsx` (fullscreen quad), `Moonrise.tsx` (mesh scene,
  breath wiring), `Ukiyo.tsx` (toon), `Particles.tsx` (TSL compute),
  `ParticlesTG.tsx` (TypeGPU compute).

## 5. TypeGPU — how to move forward

**Verdict from the PoC (validated on-sim, A/B vs TSL: identical 60fps/16.7ms/p95≈17ms):**
keep TSL for materials/fragment work; author **new compute passes in TypeGPU**. In
this codebase TSL is untyped by policy, so TGSL kernels are the only fully
type-checked GPU code — real DX win, zero perf cost, zero extra copies.

**The interop recipe** (see `src/backgrounds/ParticlesTG.tsx`):
1. Create the `THREE.StorageBufferAttribute`; after `renderer.init()`, force
   allocation via `renderer.backend.createStorageAttribute(attr)` and grab the raw
   GPUBuffer with `backend.get(attr).buffer`.
2. `tgpu.initFromDevice({ device })` with the renderer's device
   (`renderer.backend.device`) — same device, same queue, ordering is safe.
3. Adopt the buffer zero-copy: `root.createMutable(d.arrayOf(d.vec3f, N), rawBuffer)`
   (itemSize-3 storage attributes are already 16-byte-stride packed = WGSL
   `array<vec3f>`).
4. Author kernels as TGSL (`'use gpu'` functions; babel plugin transpiles), uniforms
   via `root.createUniform(...)` + `.write()` per frame, dispatch via
   `root.createGuardedComputePipeline(kernel).dispatchThreads(N)` before
   `renderer.render`.
5. Setup lazily on the first animate frame (device is guaranteed then). Exactly one
   boundary cast is needed (`renderer as unknown as { backend: ... }`).

Caveats: `@typegpu/three`'s `toTSL/fromTSL` is one-directional (TSL → TypeGPU); you
cannot wrap a TypeGPU buffer as a TSL node — hence the adopt-three's-buffer pattern.
TypeGPU's guarded 1D pipeline uses workgroup size 256 (three's TSL default is 64) —
didn't matter at 80k particles. Duplicated noise helpers (TSL + TGSL copies) are the
main cost when a scene needs the same math in both stages.

**For the 10 scenes:** any scene with particles/simulation (flocking, fluid-ish
advection, growth systems, GPU cellular automata — e.g. a GPU Game of Life to replace
the CPU one) should do compute in TypeGPU. Pure fragment/raymarch scenes stay TSL.

## 6. Performance

- Budgets that proved comfortable (60fps sim, 30fps cap in app): 44–180-step
  fullscreen raymarches, 80k compute particles, ~30k-vert displaced meshes, bloom
  post. The cheapest class by far: Ukiyo-style band math (2 draws, few noise taps).
- **Measurement:** pass `logFrameStats: true` (+ `targetFps: 240` to uncap) to a
  scene's loop → `[frame-stats] <label> fps/avg/p95` renders on-screen via the
  dev-only `FrameStatsOverlay` (in `Main`) and console.warn. Read via screenshot —
  the a11y tree does not expose it. **The simulator is vsync-locked at 60fps even at
  3× supersample — fps tuning must happen on a physical device.**
- Knobs in `makeWebGPURenderer`: `renderScale` (fraction of native pixels; big
  fragment lever) and `dawnToggles` (`skip_validation`, `disable_robustness` for
  release-profile experiments). Wired, verified, off by default.
- Known issues: directional-light shadows + receiveShadow crash on device
  (react-native-webgpu #333) — avoid shadow maps; Skia ≥2.4.16 breaks iOS builds with
  webgpu (#367) — Skia stays 2.2.12; `THREE.Clock` deprecation warns are cosmetic
  (move to `Timer` opportunistically).

## 7. Licensed packs (derivative sources)

`/Users/aaronmarz/Downloads/threejs-water-pro` (v3.1.0) and
`/Users/aaronmarz/Downloads/threejs-sky-pro` (v1.0.0), DRG Software Solutions
commercial license: derivatives inside this shipped app are permitted; publishing the
source or shipping a reusable water/sky library is not. Keep the repo private. Both
are TSL/WebGPU-first; richest reusable math: water-pro `gerstner.ts`, `waterColor.ts`
(Beer-Lambert), `fresnel.ts`, `sss.ts`; sky-pro `SkyMaterial.ts` (scatter march),
`config/atmosphere.ts` (physical constants), moon phase shading, `cirrusLayer.ts`.

## 8. Dev-workflow gotchas (each cost real time)

- **Watchman rot** on this tree → Metro serves stale graphs ("1 module" deltas,
  edits silently ignored). Fix: `watchman watch-del <repo> && watchman watch-project
  <repo>`, restart Metro. Suspect this first when code changes don't appear.
  Recurred 2026-07-08 mid-session (even on a freshly reset watch): the tell was
  shader-constant edits producing pixel-identical screenshots across relaunches
  while every bundle logged "(1 module)". When tuning looks inert, verify the
  bundle module count changes before doubting the shader math.
- **Dev client cached bundles**: its stored Metro URL is a LAN IP that changes per
  network; unreachable → silently runs the last cached bundle (sometimes with a stuck
  "Refreshing…" banner). Fix: `xcrun simctl openurl booted
  "com.mdnt.brwk://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
- **LogBox toast covers the bottom nav** and eats SCENES taps —
  `agent-device react-native dismiss-overlay` before driving.
- Verify what's actually mounted with screenshots (`xcrun simctl io booted
  screenshot`), not the a11y tree; verify scene selection by the picker highlight.
- iOS Debug builds need `ios.buildReactNativeFromSource: true`
  (`ios/Podfile.properties.json`) — the prebuilt RN core artifact is Release-variant
  and fails Debug links (`Sealable` symbol).
- **Volumetric-glow scene design lessons** (Undercurrent, 2026-07-08): (1) with
  `fract(x/s + 0.5) - 0.5` repetition the lattice zero is a SHEET, so a camera at
  the origin flies inside glowing matter and the frame washes out uniformly — drop
  the half-cell offset so the path sits mid-gap; (2) glow structures must lie
  PARALLEL to the flight axis (curtains/layers) — sheets stacked across the path
  are pierced equally by every ray, so there is no ray-to-ray variance and no
  contrast; (3) sRGB gamma lifts accumulator output hard: a 0.25 final gray needs
  raw ≈ 0.05, so background rays must accumulate almost nothing; every through-
  crossing of a clamped-thickness sheet deposits a fixed glow chunk that sets the
  field's floor.
- **Instanced vertex-displacement pattern PROVEN on-sim** (Seagrass, 2026-07-09):
  `THREE.InstancedMesh` + `MeshBasicNodeMaterial` with `positionNode` deriving all
  placement/lift/tilt from `instanceIndex` renders correctly on react-native-webgpu
  (14.4k box instances). Requirements: leave instance matrices identity and never
  update them; set `mesh.frustumCulled = false` (identity-matrix bounds would cull
  the whole field); fake all shading in `colorNode` from `positionWorld` /
  `positionGeometry` interpolants — no lights, no shadows, no MeshStandardMaterial.
  (Contrast: instanced THREE.Sprite + SpriteNodeMaterial rendered BLACK — see the
  Lightstream lesson; and THREE.Points renders 1px. This is now the third proven
  render idiom alongside fullscreen-quad TSL and Points+PointsNodeMaterial.)

## 9. Status (2026-07-09): the set is built

All 11 scenes are built, registered, and user-reviewed (see §2). What remains:

- **Name lock** — every scene name is a placeholder (rename in `metadata.ts`).
- **Open art-pass calls** — Sea Smoke lower-field brightness (`MIST_NORM`) + grain;
  Ember Vale exposure/strata (`ACC_SCALE`); dark scenes read near-black in the
  blurred Scenes-sheet preview (accept, or add a preview-boost uniform).
- **Default scene** — `DEFAULT_BACKGROUND_SOURCE_ID` is `longwater`; changeable.
- **Welcome splash** — still renders the archived SinPulse (see §2).
- **Physical-device perf pass** — the sim is vsync-locked (§6); run the
  frame-stats overlay uncapped on hardware before shipping.
