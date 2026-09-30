"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { useEffect, useState } from "react";

import { damp, view } from "@/lib/state";
import { BACKGROUND, BLOOM_THRESHOLD } from "@/lib/theme";
import Backdrop from "./Backdrop";
import DeepField from "./DeepField";
import ParticleField from "./ParticleField";

/**
 * Eases the raw pointer into the value the scene follows, and owns the
 * decay of the two one-shot energies. Keeping all three in one place
 * means nothing else has to remember to tick them.
 */
function PointerRig() {
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    view.smoothX = damp(view.smoothX, view.pointerX, 4.5, dt);
    view.smoothY = damp(view.smoothY, view.pointerY, 4.5, dt);
    // Scroll energy decays on its own; the scroll listener tops it up.
    view.velocity = damp(view.velocity, 0, 3.5, dt);
    // The shockwave travels outward at a fixed rate rather than easing,
    // so it always reaches the edge of the frame and then stops.
    if (view.pulse > 0) view.pulse = Math.max(0, view.pulse - dt * 0.55);
  });
  return null;
}

/**
 * Quality by viewport, decided once on mount. These scenes are
 * fill-rate bound, not triangle bound, so this and the DPR cap are the
 * only two levers that move much.
 */
function pickCount(width: number, reduced: boolean) {
  if (reduced) return 34000;
  if (width < 700) return 38000;
  if (width < 1100) return 72000;
  if (width < 1700) return 124000;
  return 152000;
}

/**
 * The deep field is cheap enough to keep everywhere — it is the only
 * thing giving the frame a floor, and dropping it on small screens left
 * the subject floating on flat black.
 */
function pickStars(width: number) {
  if (width < 700) return 900;
  if (width < 1100) return 1600;
  return 2600;
}

export default function Scene() {
  const [count, setCount] = useState<number | null>(null);
  const [dpr, setDpr] = useState<[number, number]>([1, 1.75]);
  const [stars, setStars] = useState(2600);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    view.reduced = reduced;
    setCount(pickCount(window.innerWidth, reduced));
    setStars(pickStars(window.innerWidth));
    // Harder cap on very dense displays — bloom is the expensive part.
    setDpr(window.devicePixelRatio > 2 ? [1, 1.35] : [1, 1.75]);
  }, []);

  if (count === null) return null;

  return (
    <Canvas
      className="webgl"
      dpr={dpr}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: false,
      }}
      camera={{ fov: 45, near: 0.1, far: 240, position: [0, 0, 9.6] }}
      // Tone mapping happens in the composer, not on the material.
      flat
    >
      <color attach="background" args={[BACKGROUND]} />

      <PointerRig />
      <Backdrop />
      <DeepField count={stars} />
      <ParticleField count={count} />

      {/* MSAA does nothing for an additive point cloud and costs a lot
          with a composer attached. */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.55}
          luminanceThreshold={BLOOM_THRESHOLD}
          luminanceSmoothing={0.42}
          mipmapBlur
          radius={0.84}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.24} darkness={0.78} />
        {/* The grain is doing real work: near-black gradients are full
            of banding, and this is what hides it. */}
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.24} />
      </EffectComposer>
    </Canvas>
  );
}
