import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  Fn,
  float,
  vec2,
  vec3,
  sin,
  cos,
  fract,
  floor,
  mix,
  smoothstep,
  max,
  abs,
  dot,
  length,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const TWO_PI = 6.2831853;
const MAX_DELTA_SECONDS = 0.1;
const BREATH_RESPONSE_RATE = 4.2;
const INHALE_RESPONSE_RATE = 5.0;
const INHALE_FLOW_GAIN = 3.0;

// Paper + wash palette. Paper white only at the very edges; most of the
// frame is a soft cyan wash like the painting's bleed.
const PAPER_BRIGHT = vec3(0.965, 0.972, 0.965);
const PAPER_WARM = vec3(0.93, 0.935, 0.918);
const WASH_LIGHT = vec3(0.7, 0.92, 0.94); // pale cyan, broad area
const WASH_MID = vec3(0.24, 0.76, 0.86); // mid cyan around the bundle
const WASH_DEEP = vec3(0.03, 0.46, 0.62); // deep teal pooling near ink
const CYAN_BLEED = vec3(0.0, 0.74, 0.86);
const INK_TEAL = vec3(0.0, 0.18, 0.24);

// Ink: blue-black body, near-pure-black at the densest core.
const INK_BODY = vec3(0.018, 0.052, 0.078);
const INK_CORE = vec3(0.008, 0.012, 0.02);

const FBM_ROT_C = Math.cos(0.62);
const FBM_ROT_S = Math.sin(0.62);

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const rand2 = Fn(([n]: [ReturnType<typeof vec2>]) => {
  return fract(sin(dot(n, vec2(12.9898, 78.233))).mul(43758.5453));
});

const noise2 = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const ip = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));

  return mix(
    mix(rand2(ip), rand2(ip.add(vec2(1.0, 0.0))), u.x),
    mix(rand2(ip.add(vec2(0.0, 1.0))), rand2(ip.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

const fbm2 = Fn(([pIn]: [ReturnType<typeof vec2>]) => {
  let p: ReturnType<typeof vec2> = pIn;
  let value: ReturnType<typeof float> = float(0.0);
  let amplitude = 0.5;

  for (let i = 0; i < 4; i++) {
    value = value.add(noise2(p).mul(amplitude));
    const x = p.x.mul(FBM_ROT_C).sub(p.y.mul(FBM_ROT_S)).mul(2.03).add(19.1);
    const y = p.x.mul(FBM_ROT_S).add(p.y.mul(FBM_ROT_C)).mul(2.03).add(71.7);
    p = vec2(x, y);
    amplitude *= 0.5;
  }

  return value;
});

export const InkBloom = ({
  grayscale = false,
  breath,
  onReady,
}: {
  grayscale?: boolean;
  breath?: SharedValue<number>;
  onReady?: () => void;
}) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  const breathRef = useRef(breath);
  grayscaleRef.current = grayscale;
  breathRef.current = breath;

  useEffect(() => {
    const context = ref.current?.getContext("webgpu");
    if (!context) {
      return;
    }

    const canvas = context.canvas as unknown as {
      width: number;
      height: number;
    };
    const { width, height } = canvas;
    const aspect = width / height;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const inhaleU = uniform(float(0));

    const computeColor = Fn(() => {
      const rawUv = uv();
      const centered = rawUv.sub(0.5).mul(2.0);
      // Aspect-correct so the painting reads as roughly square on a tall phone.
      const st = vec2(centered.x.mul(aspectU), centered.y);

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const inhaleEase = smoothstep(float(0.02), float(1.0), inhaleU);
      const time = timeU.mul(0.42);
      const sourceOrigin = vec2(
        float(-0.06).add(sin(time.mul(0.22)).mul(0.025)),
        float(-0.38).add(cos(time.mul(0.18)).mul(0.018)),
      );
      const labelDistance = length(vec2(st.x.mul(1.18), st.y.mul(1.35)));
      const labelDenseGuard = smoothstep(
        float(0.22),
        float(0.46),
        labelDistance,
      );
      const labelVeilGuard = float(0.18).add(
        smoothstep(float(0.18), float(0.5), labelDistance).mul(0.82),
      );

      // ---------- BACKGROUND: paper + broad cyan wash ----------
      const paperGrain = fbm2(st.mul(2.4).add(vec2(7.1, 3.3)));
      const paperBase = mix(PAPER_BRIGHT, PAPER_WARM, paperGrain.mul(0.35));

      // Big wash that fills most of the screen — only outer corners stay paper.
      const washCenter = sourceOrigin.add(
        vec2(sin(time.mul(0.18)).mul(0.04), cos(time.mul(0.14)).mul(0.025)),
      );
      const washVec = st.sub(washCenter);
      const washRadial = length(vec2(washVec.x.mul(0.78), washVec.y.mul(0.96)));

      const washReach = float(1.35)
        .add(breathEase.mul(0.18))
        .add(inhaleEase.mul(0.22));
      const washShape = float(1.0).sub(
        smoothstep(washReach.mul(0.25), washReach, washRadial),
      );
      const washNoise = fbm2(
        washVec.mul(1.4).add(vec2(time.mul(0.04), time.mul(-0.03))),
      );
      const washMask = washShape
        .mul(float(0.55).add(washNoise.mul(0.55)))
        .clamp(0.0, 1.0);

      // Inner deeper pooling follows the pigment source instead of the UI.
      const innerWash = float(1.0).sub(
        smoothstep(
          float(0.0),
          float(0.62),
          length(vec2(washVec.x.mul(0.92), washVec.y.mul(1.28))),
        ),
      );
      const innerWashNoise = fbm2(washVec.mul(2.4).add(vec2(11.0, 5.0)));
      const innerWashMask = innerWash
        .mul(float(0.5).add(innerWashNoise.mul(0.55)))
        .clamp(0.0, 1.0);

      const groundLight = mix(paperBase, WASH_LIGHT, washMask.mul(0.95));
      const groundMid = mix(groundLight, WASH_MID, innerWashMask.mul(0.72));
      const ground = mix(
        groundMid,
        WASH_DEEP,
        innerWashMask.mul(innerWashMask).mul(0.42),
      );

      // ---------- INK: off-center pigment field ----------
      const inkP = st.sub(sourceOrigin);
      const t = time;

      const sourceDistance = length(vec2(inkP.x.mul(1.12), inkP.y.mul(0.86)));
      const sourceNoise = fbm2(inkP.mul(7.0).add(vec2(12.0, t.mul(0.08))));
      const sourceEdgeNoise = fbm2(
        inkP.mul(22.0).add(vec2(t.mul(0.08), 33.0)),
      ).sub(0.5);
      const sourceRadius = float(0.044)
        .add(sourceNoise.mul(0.024))
        .add(inhaleEase.mul(0.018));
      const sourceCore = float(1.0).sub(
        smoothstep(
          sourceRadius,
          sourceRadius.add(0.052),
          sourceDistance.add(sourceEdgeNoise.mul(0.055)),
        ),
      ).mul(float(0.84).add(sourceNoise.mul(0.16)));

      let flow = inkP;
      const curl = vec2(
        fbm2(flow.mul(1.25).add(vec2(t.mul(0.08), 14.0))),
        fbm2(flow.mul(1.25).add(vec2(37.0, t.mul(-0.07)))),
      ).sub(0.5);
      flow = flow.add(
        curl.mul(float(0.36).add(breathEase.mul(0.12)).add(inhaleEase.mul(0.14))),
      );

      const rise = flow.y.add(0.06);
      const risePositive = max(rise, float(0.0));
      const riseMask = smoothstep(float(-0.12), float(0.2), rise).mul(
        float(1.0).sub(smoothstep(float(1.02), float(1.58), rise)),
      );
      const plumeCenter = sin(rise.mul(2.1).add(t.mul(0.28)))
        .mul(0.15)
        .sub(rise.mul(0.12));
      const plumeWidth = float(0.18)
        .add(risePositive.mul(0.23))
        .add(breathEase.mul(0.05))
        .add(inhaleEase.mul(0.11));
      const plumeBand = float(1.0).sub(
        smoothstep(
          plumeWidth,
          plumeWidth.add(0.46),
          abs(flow.x.sub(plumeCenter)),
        ),
      );

      const bodyNoise = fbm2(
        vec2(flow.x.mul(1.8), flow.y.mul(2.5)).add(
          vec2(t.mul(0.05), t.mul(-0.07)),
        ),
      );
      const smokyBody = plumeBand
        .mul(riseMask)
        .mul(smoothstep(float(0.12), float(0.86), bodyNoise))
        .mul(float(0.7).add(breathEase.mul(0.12)).add(inhaleEase.mul(0.2)));

      const threadNoise = fbm2(
        vec2(flow.x.mul(5.2), flow.y.mul(7.5)).add(
          vec2(t.mul(-0.12), t.mul(0.1)),
        ),
      );
      const filamentMask = (
        x0: number,
        reach: number,
        bend: number,
        waveAmp: number,
        waveFreq: number,
        phase: number,
        width: number,
      ) => {
        const u = flow.y.div(float(reach));
        const yGate = smoothstep(float(-0.02), float(0.08), u).mul(
          float(1.0).sub(smoothstep(float(0.78), float(1.05), u)),
        );
        const centerX = float(x0)
          .add(u.mul(bend))
          .add(
            sin(u.mul(waveFreq).add(phase).add(t.mul(0.24))).mul(waveAmp),
          );
        const filamentNoise = fbm2(
          vec2(u.mul(9.0).add(phase), flow.x.mul(34.0).add(t.mul(0.07))),
        );
        const taper = float(1.0).sub(
          smoothstep(float(0.46), float(1.0), u).mul(0.74),
        );
        const localWidth = max(
          float(0.004),
          float(width)
            .mul(taper)
            .mul(float(0.62).add(filamentNoise.mul(0.78))),
        );
        const centerDistance = abs(flow.x.sub(centerX));
        const line = float(1.0).sub(
          smoothstep(localWidth, localWidth.mul(3.1), centerDistance),
        );
        const breaks = smoothstep(float(0.22), float(0.82), filamentNoise);

        return line.mul(yGate).mul(breaks);
      };

      const sweepMask = (
        y0: number,
        reach: number,
        bend: number,
        waveAmp: number,
        phase: number,
        width: number,
      ) => {
        const u = flow.x.mul(-1.0).div(float(reach));
        const xGate = smoothstep(float(-0.02), float(0.08), u).mul(
          float(1.0).sub(smoothstep(float(0.74), float(1.04), u)),
        );
        const centerY = float(y0)
          .sub(u.mul(bend))
          .add(sin(u.mul(8.0).add(phase).add(t.mul(0.2))).mul(waveAmp));
        const sweepTexture = fbm2(
          vec2(u.mul(8.5).add(phase), flow.y.mul(30.0).sub(t.mul(0.05))),
        );
        const line = float(1.0).sub(
          smoothstep(float(width), float(width * 3.4), abs(flow.y.sub(centerY))),
        );

        return line
          .mul(xGate)
          .mul(smoothstep(float(0.18), float(0.82), sweepTexture));
      };

      const filaments = max(
        max(
          max(
            filamentMask(-0.045, 1.0, -0.15, 0.085, 7.4, 0.2, 0.018),
            filamentMask(0.035, 0.84, 0.16, 0.055, 8.6, 1.6, 0.016),
          ),
          max(
            filamentMask(-0.1, 0.68, -0.32, 0.048, 7.8, 3.0, 0.015),
            filamentMask(0.08, 0.62, 0.31, 0.044, 9.2, 4.4, 0.014),
          ),
        ),
        max(
          filamentMask(0.0, 0.92, 0.02, 0.12, 10.5, 2.2, 0.013),
          max(
            sweepMask(-0.08, 0.82, 0.18, 0.07, 1.1, 0.016),
            sweepMask(-0.18, 0.54, 0.1, 0.052, 3.9, 0.013),
          ),
        ),
      );

      const sweepLine = flow.y
        .add(flow.x.mul(0.2))
        .add(sin(flow.x.mul(3.4).add(t.mul(0.34))).mul(0.12));
      const leftReach = float(1.0).sub(
        smoothstep(float(-0.86), float(0.12), flow.x),
      );
      const sweepNoise = fbm2(
        vec2(flow.x.mul(3.0), flow.y.mul(4.0)).add(vec2(19.0, t.mul(0.05))),
      );
      const softSweep = float(1.0)
        .sub(smoothstep(float(0.08), float(0.42), abs(sweepLine)))
        .mul(leftReach)
        .mul(float(1.0).sub(smoothstep(float(0.06), float(1.28), length(flow))))
        .mul(float(0.32).add(sweepNoise.mul(0.34)));

      const sourceInfluence = float(1.0).sub(
        smoothstep(float(0.06), float(0.74), sourceDistance),
      );

      // A few broken pigment flecks near the source, not across the full field.
      const splatterSpace = inkP.mul(9.0);
      const splatCell = floor(splatterSpace);
      const splatLocal = fract(splatterSpace).sub(0.5);
      const splatSeed = rand2(splatCell);
      const splatDot = float(1.0).sub(
        smoothstep(float(0.035), float(0.14), length(splatLocal)),
      );
      const splatter = splatDot
        .mul(smoothstep(float(0.94), float(0.995), splatSeed))
        .mul(sourceInfluence);

      const currentVeil = max(max(smokyBody, softSweep), filaments.mul(0.72))
        .mul(labelVeilGuard)
        .clamp(0.0, 1.0);
      const darkCurrent = filaments
        .mul(float(0.72).add(sourceInfluence.mul(0.18)))
        .mul(float(0.68).add(threadNoise.mul(0.32)));
      const inkDensity = max(max(sourceCore, darkCurrent), splatter)
        .mul(labelDenseGuard)
        .clamp(0.0, 1.0);

      const smokeNoise = fbm2(
        inkP.mul(2.0).add(vec2(t.mul(-0.035), t.mul(0.05))),
      );
      const smokeReach = float(1.0).sub(
        smoothstep(float(0.12), float(1.14), sourceDistance),
      );
      const smokeVeil = smoothstep(float(0.2), float(0.84), smokeNoise)
        .mul(smokeReach)
        .mul(float(0.26).add(breathEase.mul(0.08)).add(inhaleEase.mul(0.12)));
      const sourceBleed = float(1.0)
        .sub(
          smoothstep(
            float(0.0),
            float(0.42).add(inhaleEase.mul(0.08)),
            sourceDistance,
          ),
        )
        .mul(0.52);

      const totalDiffusion = max(
        max(currentVeil.mul(0.66), smokeVeil),
        sourceBleed,
      ).clamp(0.0, 1.0);

      // ---------- COMPOSE ----------
      const groundWithDiffusion = mix(
        ground,
        WASH_DEEP,
        totalDiffusion.mul(float(1.0).sub(inkDensity)).mul(0.76),
      );
      const cyanBloom = max(totalDiffusion.mul(0.58), currentVeil.mul(0.52))
        .mul(float(1.0).sub(inkDensity.mul(0.62)))
        .clamp(0.0, 1.0);
      const cyanGround = mix(
        groundWithDiffusion,
        CYAN_BLEED,
        cyanBloom.mul(0.58),
      );

      const inkColor = mix(
        mix(INK_BODY, INK_TEAL, currentVeil.mul(0.46)),
        INK_CORE,
        smoothstep(float(0.4), float(0.95), inkDensity),
      );

      const translucentPigment = mix(
        cyanGround,
        mix(INK_BODY, INK_TEAL, currentVeil.mul(0.4)),
        currentVeil.mul(float(0.2).add(sourceInfluence.mul(0.2))),
      );
      const composed = mix(translucentPigment, inkColor, inkDensity);

      const grain = rand2(rawUv.mul(vec2(1280.0, 720.0)).add(time.mul(TWO_PI)))
        .sub(0.5)
        .mul(0.008);
      const finalColor = composed.add(vec3(grain, grain, grain));

      const lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
      return mix(finalColor, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let inkTime = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let inhalePower = 0;

    function animate() {
      if (disposed) {
        return;
      }

      const delta = Math.min(clock.getDelta(), MAX_DELTA_SECONDS);
      const targetBreath = breathRef.current?.value ?? 0.0;
      const breathDelta = targetBreath - smoothedBreath;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        delta,
      );
      inhalePower = damp(
        inhalePower,
        clampNumber(breathDelta * INHALE_FLOW_GAIN, 0.0, 1.0),
        INHALE_RESPONSE_RATE,
        delta,
      );
      inkTime += delta * (1.0 + smoothedBreath * 0.16 + inhalePower * 0.62);

      (timeU as unknown as { value: number }).value = inkTime;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (inhaleU as unknown as { value: number }).value = inhalePower;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "InkBloom",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
