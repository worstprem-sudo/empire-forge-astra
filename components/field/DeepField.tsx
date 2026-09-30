"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { mulberry32 } from "@/lib/noise";
import { view } from "@/lib/state";
import { starFragmentShader, starVertexShader } from "./shaders";

/**
 * Static deep field behind the subject. Cheap, always on, and on its
 * own parallax so the frame keeps depth even while the cloud is held.
 */
export default function DeepField({ count = 2600 }: { count?: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);

  const { geometry, mat } = useMemo(() => {
    const rnd = mulberry32(0x6a09e667);
    const pos = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const phase = new Float32Array(count);
    const warm = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Spread wide, but not nearly as deep as before: the size divisor
      // is 1/z, so a star parked at z = -54 was arriving sub-pixel no
      // matter how large its own size attribute was.
      pos[i3] = (rnd() - 0.5) * 58;
      pos[i3 + 1] = (rnd() - 0.5) * 40;
      pos[i3 + 2] = -12 - Math.pow(rnd(), 0.85) * 26;
      // pow(rnd, 3.4) pinned almost every star at the floor. A gentler
      // exponent keeps the same few-bright-many-faint shape while
      // actually populating the middle of the range.
      siz[i] = 0.85 + Math.pow(rnd(), 2.2) * 3.1;
      phase[i] = rnd() * Math.PI * 2;
      warm[i] = rnd() > 0.78 ? 0.7 + rnd() * 0.3 : rnd() * 0.15;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geometry.setAttribute("aWarm", new THREE.BufferAttribute(warm, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

    const mat = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uParallaxX: { value: 0 },
        uParallaxY: { value: 0 },
        uIntro: { value: 0 },
      },
    });

    return { geometry, mat };
  }, [count]);

  useFrame((state) => {
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);
    u.uIntro.value = view.intro;
    if (!view.reduced) {
      u.uParallaxX.value = view.smoothX * 1.4;
      u.uParallaxY.value = view.smoothY * 0.9;
    }
  });

  return (
    <points frustumCulled={false} geometry={geometry} renderOrder={-1}>
      <primitive object={mat} ref={material} attach="material" />
    </points>
  );
}
