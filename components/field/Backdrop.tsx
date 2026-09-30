"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { view } from "@/lib/state";

/**
 * Nebula haze behind everything else.
 *
 * One quad, parked in front of the camera and rescaled to fill the
 * frustum. Every radiance value here is *linear and pre-ACES*, which is
 * why the numbers look implausibly small — and they are deliberately
 * held below the bloom threshold so the ambient field never blooms
 * into itself and washes the page out as you scroll.
 */

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform float uAspect;
  uniform float uIntro;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float a = 0.5;
    float s = 0.0;
    float n = 0.0;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      n += a;
      a *= 0.52;
      p = p * 2.03 + vec2(17.3, 9.1);
    }
    return s / n;
  }

  void main() {
    vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);

    // Two slowly counter-drifting layers. A single layer reads as a
    // texture; two at different rates read as depth.
    float t = uTime * 0.006;
    float a = fbm(p * 1.35 + vec2(t, uProgress * 0.55));
    float b = fbm(p * 2.6 - vec2(t * 1.7, uProgress * 0.9 + 4.2));

    float cloud = pow(max(0.0, a * 0.78 + b * 0.48 - 0.36), 1.7);

    // Cold blue body with a violet rim, and a faint warm pool that
    // drifts in as the page advances so no two chapters share a sky.
    vec3 cold = vec3(0.055, 0.12, 0.34);
    vec3 violet = vec3(0.14, 0.09, 0.34);
    vec3 warm = vec3(0.30, 0.17, 0.09);

    vec3 c = mix(cold, violet, smoothstep(0.2, 0.9, b));
    c = mix(c, warm, smoothstep(0.45, 1.0, uProgress) * 0.4 * b);

    // Corner-weighted: the middle of the frame stays clean, because the
    // subject and the display type both live there.
    float radial = 1.0 - smoothstep(0.1, 0.78, length(p));
    float edge = mix(1.0, 0.24, radial);

    /* Still well under the bloom threshold, so the haze can never
       bloom into itself and wash the page out — but high enough to
       actually be a visible floor rather than pure black. */
    float amp = 0.13 * uIntro;
    gl_FragColor = vec4(c * cloud * edge * amp, 1.0);
  }
`;

const PLANE_Z = -22;

export default function Backdrop() {
  const mesh = useRef<THREE.Mesh>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        depthWrite: false,
        depthTest: false,
        transparent: false,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uAspect: { value: 1.7 },
          uIntro: { value: 0 },
        },
      }),
    []
  );

  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const m = mesh.current;
    if (!m) return;

    const dist = cam.position.z - PLANE_Z;
    const h = 2 * Math.tan((cam.fov * 0.5 * Math.PI) / 180) * dist;
    const w = h * cam.aspect;
    // Slight overscale, and the quad tracks the camera's parallax, so
    // its edges can never swing into frame.
    m.scale.set(w * 1.12, h * 1.12, 1);
    m.position.set(cam.position.x, cam.position.y, PLANE_Z);

    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uProgress.value = view.progress;
    u.uAspect.value = cam.aspect;
    u.uIntro.value = view.intro;
  });

  return (
    <mesh ref={mesh} renderOrder={-2} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
