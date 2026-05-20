import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  Fn,
  Loop,
  float,
  vec3,
  vec2,
  vec4,
  sin,
  fract,
  floor,
  mix,
  smoothstep,
  pow,
  abs,
  dot,
  length,
  mod,
  max,
  min,
  step,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- Parameters ---
const SCALE = 1.0;
const DRIFT_SPEED = 1.0;
const BREATH_ZOOM_AMOUNT = 0.045;
const BREATH_THRESHOLD_AMOUNT = 0.035;
const BREATH_GLOW_AMOUNT = 0.08;
const BREATH_RESPONSE_RATE = 4.8;
const BREATH_MOTION_GAIN = 4.2;
const BREATH_MOTION_ATTACK_RATE = 7.0;
const BREATH_MOTION_RELEASE_RATE = 2.8;
const HOLD_TIME_SCALE = 0.0015;
const BREATH_TIME_SCALE = 0.72;
const HOLD_OSCILLATION_AMOUNT = 0.28;
const HOLD_OSCILLATION_SPEED = 0.34;
const HOLD_OSCILLATION_DETAIL_AMOUNT = 0.06;
const HOLD_OSCILLATION_DETAIL_SPEED = 0.63;
const INK_EDGE_WIDTH = 0.035;
const VIGNETTE_POWER = 0.3;
const GRAIN_STRENGTH = 0.05;

const COLOR_PAPER = vec3(0.008, 0.373, 0.494);
const COLOR_PAPER_GLOW = vec3(0.086, 0.557, 0.714);
const COLOR_INK_1 = vec3(0.006, 0.045, 0.07);
const COLOR_INK_2 = vec3(0.141, 0.827, 1.0);
const COLOR_INK_3 = vec3(0.478, 0.965, 1.0);

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// --- TSL shader functions ---

const permute = Fn(([x]: [ReturnType<typeof vec4>]) => {
  return mod(x.mul(34.0).add(1.0).mul(x), float(289.0));
});

const taylorInvSqrt = Fn(([r]: [ReturnType<typeof vec4>]) => {
  return float(1.79284291400159).sub(r.mul(0.85373472095314));
});

const simplexNoise = Fn(([v]: [ReturnType<typeof vec3>]) => {
  const c = vec2(1.0 / 6.0, 1.0 / 3.0);
  const i0 = floor(v.add(dot(v, vec3(c.y, c.y, c.y))));
  const x0 = v.sub(i0).add(dot(i0, vec3(c.x, c.x, c.x)));

  const g = step(vec3(x0.y, x0.z, x0.x), x0);
  const l = float(1.0).sub(g);
  const i1 = min(g, vec3(l.z, l.x, l.y));
  const i2 = max(g, vec3(l.z, l.x, l.y));

  const x1 = x0.sub(i1).add(c.x);
  const x2 = x0.sub(i2).add(c.x.mul(2.0));
  const x3 = x0.sub(1.0).add(c.x.mul(3.0));

  const i = mod(i0, float(289.0));
  const p = permute(
    permute(
      permute(vec4(i.z, i.z.add(i1.z), i.z.add(i2.z), i.z.add(1.0))).add(
        vec4(i.y, i.y.add(i1.y), i.y.add(i2.y), i.y.add(1.0)),
      ),
    ).add(vec4(i.x, i.x.add(i1.x), i.x.add(i2.x), i.x.add(1.0))),
  );

  const ns = vec3(2.0 / 7.0, 0.5 / 7.0 - 1.0, 1.0 / 7.0);
  const j = p.sub(floor(p.mul(ns.z).mul(ns.z)).mul(49.0));
  const x_ = floor(j.mul(ns.z));
  const y_ = floor(j.sub(x_.mul(7.0)));
  const x = x_.mul(ns.x).add(ns.y);
  const y = y_.mul(ns.x).add(ns.y);
  const h = float(1.0).sub(abs(x)).sub(abs(y));

  const b0 = vec4(x.x, x.y, y.x, y.y);
  const b1 = vec4(x.z, x.w, y.z, y.w);
  const s0 = floor(b0).mul(2.0).add(1.0);
  const s1 = floor(b1).mul(2.0).add(1.0);
  const sh = float(0.0).sub(step(h, vec4(0.0)));

  const a0 = vec4(b0.x, b0.z, b0.y, b0.w).add(
    vec4(s0.x, s0.z, s0.y, s0.w).mul(vec4(sh.x, sh.x, sh.y, sh.y)),
  );
  const a1 = vec4(b1.x, b1.z, b1.y, b1.w).add(
    vec4(s1.x, s1.z, s1.y, s1.w).mul(vec4(sh.z, sh.z, sh.w, sh.w)),
  );

  const p0Raw = vec3(a0.x, a0.y, h.x);
  const p1Raw = vec3(a0.z, a0.w, h.y);
  const p2Raw = vec3(a1.x, a1.y, h.z);
  const p3Raw = vec3(a1.z, a1.w, h.w);
  const norm = taylorInvSqrt(
    vec4(
      dot(p0Raw, p0Raw),
      dot(p1Raw, p1Raw),
      dot(p2Raw, p2Raw),
      dot(p3Raw, p3Raw),
    ),
  );
  const p0 = p0Raw.mul(norm.x);
  const p1 = p1Raw.mul(norm.y);
  const p2 = p2Raw.mul(norm.z);
  const p3 = p3Raw.mul(norm.w);

  const m = max(
    float(0.6).sub(
      vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)),
    ),
    vec4(0.0),
  ).toVar();
  m.assign(m.mul(m));

  return dot(
    m.mul(m),
    vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)),
  ).mul(42.0);
});

const fbm7 = Fn(([pIn]: [ReturnType<typeof vec3>]) => {
  const p = pIn.toVar();
  const acc = float(0.0).toVar();
  const amp = float(0.5).toVar();

  Loop(7, () => {
    acc.assign(acc.add(simplexNoise(p).mul(amp)));
    p.assign(p.mul(2.0));
    amp.assign(amp.mul(0.5));
  });

  return acc;
});

const fbm5 = Fn(([pIn]: [ReturnType<typeof vec3>]) => {
  const p = pIn.toVar();
  const acc = float(0.0).toVar();
  const amp = float(0.5).toVar();

  Loop(5, () => {
    acc.assign(acc.add(simplexNoise(p).mul(amp)));
    p.assign(p.mul(2.0));
    amp.assign(amp.mul(0.5));
  });

  return acc;
});

const hash21 = Fn(([p]: [ReturnType<typeof vec2>]) => {
  return fract(sin(dot(p, vec2(532.1231, 1378.3453))).mul(53211.1223));
});

const vignette = Fn(
  ([color, q]: [ReturnType<typeof vec3>, ReturnType<typeof vec2>]) => {
    const v = float(16.0)
      .mul(q.x)
      .mul(q.y)
      .mul(float(1.0).sub(q.x))
      .mul(float(1.0).sub(q.y));
    const falloff = float(0.3).add(
      float(0.8).mul(pow(v, float(VIGNETTE_POWER))),
    );
    return color.mul(falloff);
  },
);

// --- Component ---

export const Rorschach = ({
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

    // Uniforms
    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));

    const computeColor = Fn(() => {
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const time = timeU.mul(DRIFT_SPEED);
      const breathZoom = float(1.0).sub(breathEase.mul(BREATH_ZOOM_AMOUNT));

      const uvRaw = uv();
      const uvCentered = uvRaw.mul(2.0).sub(1.0);
      const p = vec2(uvCentered.x.mul(aspectU), uvCentered.y)
        .mul(SCALE)
        .mul(breathZoom);
      const mirrored = vec2(abs(p.x), p.y);
      const radial = length(p);

      const grain = hash21(p).mul(GRAIN_STRENGTH);
      let color: ReturnType<typeof vec3> = mix(
        COLOR_PAPER,
        COLOR_PAPER_GLOW,
        smoothstep(float(0.0), float(1.45), radial).mul(0.34),
      ).add(vec3(grain, grain, grain));

      const inkField1 = fbm7(
        vec3(
          mirrored.x,
          mirrored.y,
          time.mul(0.05).add(30.0).add(breathEase.mul(0.08)),
        ),
      )
        .sub(0.2)
        .add(radial.mul(0.5))
        .sub(breathEase.mul(BREATH_THRESHOLD_AMOUNT));
      const inkField2 = fbm7(
        vec3(
          mirrored.x,
          mirrored.y,
          time.mul(0.04).add(16.0).sub(breathEase.mul(0.04)),
        ),
      )
        .add(radial.mul(0.5))
        .sub(breathEase.mul(BREATH_THRESHOLD_AMOUNT * 0.5));

      const ink1 = smoothstep(float(INK_EDGE_WIDTH), float(0.0), inkField1);
      const ink2 = smoothstep(float(INK_EDGE_WIDTH), float(0.0), inkField2);
      const inkTexture1 = float(0.4).add(
        fbm5(
          vec3(
            p.x.mul(0.75),
            p.y.mul(0.75),
            time.mul(0.04).add(2445.0),
          ),
        ).mul(0.6),
      );
      const inkTexture2 = float(0.4).add(
        fbm5(
          vec3(
            p.x.mul(0.75),
            p.y.mul(0.75),
            time.mul(0.04).add(256.0),
          ),
        ).mul(0.6),
      );

      color = mix(
        color,
        mix(COLOR_INK_2, COLOR_INK_3, inkTexture2.mul(0.72)),
        ink2
          .mul(inkTexture2)
          .mul(float(0.86).add(breathEase.mul(BREATH_GLOW_AMOUNT))),
      );
      color = mix(
        color,
        COLOR_INK_1,
        ink1.mul(inkTexture1).mul(float(0.96).add(breathEase.mul(0.04))),
      );

      const vignetted = vignette(color, uvRaw);
      const lum = dot(vignetted, vec3(0.299, 0.587, 0.114));
      return mix(vignetted, vec3(lum, lum, lum), grayscaleU);
    });

    // Material + mesh
    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Renderer
    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let sceneTime = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let breathMotion = 0;

    function animate() {
      if (disposed) {
        return;
      }
      const elapsed = clock.getElapsedTime();
      const deltaSeconds =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      const targetBreath = breathRef.current?.value ?? 0.0;
      const breathDelta = targetBreath - smoothedBreath;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );
      const motionTarget = Math.min(
        Math.abs(breathDelta) * BREATH_MOTION_GAIN,
        1.0,
      );
      breathMotion = damp(
        breathMotion,
        motionTarget,
        motionTarget > breathMotion
          ? BREATH_MOTION_ATTACK_RATE
          : BREATH_MOTION_RELEASE_RATE,
        deltaSeconds,
      );
      sceneTime +=
        deltaSeconds *
        (HOLD_TIME_SCALE +
          breathMotion * (BREATH_TIME_SCALE - HOLD_TIME_SCALE));
      const holdInfluence = Math.max(0, 1 - breathMotion);
      const holdOscillation =
        holdInfluence *
        holdInfluence *
        (Math.sin(elapsed * HOLD_OSCILLATION_SPEED) *
          HOLD_OSCILLATION_AMOUNT +
          Math.sin(elapsed * HOLD_OSCILLATION_DETAIL_SPEED + 1.7) *
            HOLD_OSCILLATION_DETAIL_AMOUNT);
      previousElapsed = elapsed;

      (timeU as unknown as { value: number }).value =
        sceneTime + holdOscillation;
      (grayscaleU as unknown as { value: number }).value =
        grayscaleRef.current ? 1.0 : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "MirrorBloom",
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
