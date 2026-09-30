"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { buildShapes, SHAPES } from "@/lib/shapes";
import { clamp, damp, view } from "@/lib/state";
import { particleFragmentShader, particleVertexShader } from "./shaders";

interface Props {
  count: number;
}

export default function ParticleField({ count }: Props) {
  const { size } = useThree();

  // Each shape keeps its own spin clock, so a cloud does not inherit
  // the rotation of whatever it happened to morph out of.
  const spinsY = useRef<Float32Array>(new Float32Array(SHAPES.length));
  const spinsZ = useRef<Float32Array>(new Float32Array(SHAPES.length));
  const pair = useRef<[number, number]>([-1, -1]);
  const camZ = useRef(SHAPES[0].camZ);

  const { geometry, material, shapes } = useMemo(() => {
    const shapes = buildShapes(count);
    // The generator snaps the requested count onto its u/v grid.
    const N = shapes.count;

    const geometry = new THREE.BufferGeometry();
    const vec3 = () => new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const scalar = () => new THREE.BufferAttribute(new Float32Array(N), 1);

    // `position` is never read by the shader, but three needs it to
    // work out the draw count.
    geometry.setAttribute("position", vec3());
    geometry.setAttribute("aPosA", vec3());
    geometry.setAttribute("aPosB", vec3());
    geometry.setAttribute("aColA", vec3());
    geometry.setAttribute("aColB", vec3());
    geometry.setAttribute("aSizeA", scalar());
    geometry.setAttribute("aSizeB", scalar());
    geometry.setAttribute("aOrbA", scalar());
    geometry.setAttribute("aOrbB", scalar());

    geometry.setAttribute("aRand", new THREE.BufferAttribute(shapes.rand, 3));

    // Roles are static and shared by every shape — this is what keeps a
    // particle's identity intact across the whole sequence.
    const roleF = new Float32Array(N);
    for (let i = 0; i < N; i++) roleF[i] = shapes.roles[i] * 0.5;
    geometry.setAttribute("aRole", new THREE.BufferAttribute(roleF, 1));

    // Never cull: the cloud is always the subject, and letting three
    // recompute a bounding sphere over ~150k points on every buffer
    // swap is pure cost.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      // The cloud is the only subject in the pass; sorting additive
      // points is a lie anyway.
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uSize: { value: 1 },
        uPixelRatio: { value: 1 },
        uIntro: { value: 0 },
        uVelocity: { value: 0 },

        uMouse: { value: new THREE.Vector3(999, 999, 0) },
        uMouseForce: { value: 0 },

        uSpinY: { value: 0 },
        uSpinZ: { value: 0 },
        uOrbitAxisA: { value: new THREE.Vector3(0, 1, 0) },
        uOrbitAxisB: { value: new THREE.Vector3(0, 1, 0) },

        uStagger: { value: 0.36 },
        uScatter: { value: 0.8 },
        uSwirl: { value: 0 },
        uTurb: { value: 0.8 },


        uPulse: { value: 0 },
      },
    });

    return { geometry, material, shapes };
  }, [count]);

  /** Copies two shapes' buffers into the A/B attribute slots. */
  const setPair = (a: number, b: number) => {
    const g = geometry;
    const put = (name: string, src: Float32Array) => {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      (attr.array as Float32Array).set(src);
      attr.needsUpdate = true;
    };

    put("aPosA", shapes.positions[a]);
    put("aPosB", shapes.positions[b]);
    put("aColA", shapes.colors[a]);
    put("aColB", shapes.colors[b]);
    put("aSizeA", shapes.sizes[a]);
    put("aSizeB", shapes.sizes[b]);
    put("aOrbA", shapes.orbits[a]);
    put("aOrbB", shapes.orbits[b]);

    pair.current = [a, b];
  };

  useFrame((state, rawDelta) => {
    // A tab-out otherwise arrives as one enormous step and flings the
    // scene apart.
    const dt = Math.min(rawDelta, 1 / 30);

    const a = view.shapeIndex;
    const b = Math.min(a + 1, SHAPES.length - 1);
    if (pair.current[0] !== a || pair.current[1] !== b) setPair(a, b);

    const m = view.morph;
    const shapeA = SHAPES[a];
    const shapeB = SHAPES[b];
    const u = material.uniforms;

    for (let i = 0; i < SHAPES.length; i++) {
      spinsY.current[i] += SHAPES[i].spinY * dt;
      spinsZ.current[i] += SHAPES[i].spinZ * dt;
    }

    u.uTime.value = state.clock.elapsedTime;
    u.uMorph.value = m;
    u.uIntro.value = view.intro;
    u.uVelocity.value = view.velocity;
    u.uPulse.value = view.pulse;

    u.uSpinY.value = spinsY.current[a] * (1 - m) + spinsY.current[b] * m;
    u.uSpinZ.value = spinsZ.current[a] * (1 - m) + spinsZ.current[b] * m;

    (u.uOrbitAxisA.value as THREE.Vector3).set(...(shapeA.orbitAxis as [number, number, number]));
    (u.uOrbitAxisB.value as THREE.Vector3).set(...(shapeB.orbitAxis as [number, number, number]));

    // Transition tuning comes from the shape being LEFT. Blending
    // stagger or swirl produces a motion that belongs to neither shape
    // and looks like a bug you cannot name.
    u.uStagger.value = shapeA.stagger;
    u.uScatter.value = shapeA.scatter;
    u.uSwirl.value = shapeA.swirl;
    u.uTurb.value = shapeA.turbulence;

    // Density holds on any screen if point size tracks viewport height.
    u.uSize.value = clamp(size.height / 900, 0.66, 1.5);
    u.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 2);

    // World-space extents on the z = 0 plane, for the cursor push.
    const cam = state.camera as THREE.PerspectiveCamera;
    const halfH = Math.tan((cam.fov * 0.5 * Math.PI) / 180) * camZ.current;
    const halfW = halfH * (size.width / size.height);

    (u.uMouse.value as THREE.Vector3).set(
      view.smoothX * halfW,
      view.smoothY * halfH,
      0
    );
    const force = shapeA.mouseForce * (1 - m) + shapeB.mouseForce * m;
    u.uMouseForce.value = view.reduced ? 0 : force;

    // Each shape declares the framing it wants; the camera eases
    // between them rather than cutting.
    const targetZ = shapeA.camZ * (1 - m) + shapeB.camZ * m;
    camZ.current = damp(camZ.current, targetZ, 3, dt);
    cam.position.z = camZ.current;

    if (!view.reduced) {
      cam.position.x = damp(cam.position.x, view.smoothX * 0.42, 3, dt);
      cam.position.y = damp(cam.position.y, view.smoothY * 0.3, 3, dt);
      cam.lookAt(0, 0, 0);
    }
  });

  return (
    <points frustumCulled={false} geometry={geometry}>
      <primitive object={material} attach="material" />
    </points>
  );
}
