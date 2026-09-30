/**
 * Morphing point-cloud shaders.
 *
 * Every particle carries an A slot and a B slot for each property that
 * changes between shapes; `uMorph` blends them. The blend is never a
 * straight lerp — particles start at staggered times, arc across on a
 * swirled path, bow outward and pick up turbulence mid-flight, so a
 * transition reads as the cloud *reorganising* rather than sliding.
 *
 * Every mid-flight effect is gated by sin(m * PI), which is zero at
 * both ends. That is what guarantees neither shape is disturbed by the
 * way you happen to leave it.
 */

export const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uIntro;
  uniform float uVelocity;

  uniform vec3  uMouse;
  uniform float uMouseForce;

  uniform float uSpinY;
  uniform float uSpinZ;
  uniform vec3  uOrbitAxisA;
  uniform vec3  uOrbitAxisB;

  /* Transition tuning. These belong to the shape being LEFT — they
     describe how A becomes B. Blending them would produce a transition
     that belongs to neither shape. */
  uniform float uStagger;
  uniform float uScatter;
  uniform float uSwirl;
  uniform float uTurb;

  /* One-shot radial shockwave. */
  uniform float uPulse;

  attribute vec3  aPosA;
  attribute vec3  aPosB;
  attribute vec3  aColA;
  attribute vec3  aColB;
  attribute float aSizeA;
  attribute float aSizeB;
  attribute float aOrbA;
  attribute float aOrbB;
  attribute vec3  aRand;
  attribute float aRole;

  varying vec3  vColor;
  varying float vAlpha;

  /* --- Ashima simplex noise (3D) ------------------------------------ */
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 mm = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    mm = mm * mm;
    return 42.0 * dot(mm*mm, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  /* ------------------------------------------------------------------ */

  vec3 rotateY(vec3 p, float a){
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  vec3 rotateZ(vec3 p, float a){
    float c = cos(a), s = sin(a);
    return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
  }

  /* Rodrigues rotation — lets a particle orbit about its own shape's
     tilted axis rather than a world axis. */
  vec3 rotateAxis(vec3 p, vec3 axis, float a){
    float c = cos(a), s = sin(a);
    return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
  }

  void main() {
    /* --- 1. Staggered morph ---------------------------------------- *
       Each particle starts late by aRand.x * uStagger, and the window
       that remains is rescaled so everyone still arrives exactly at
       m = 1. Without the rescale, late starters never finish. */
    float stagger = aRand.x * uStagger;
    float m = clamp((uMorph - stagger) / max(0.0001, 1.0 - uStagger), 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);

    /* --- 2. Orbit each endpoint about its OWN axis ------------------ *
       Rotating the blended position by a blended speed would smear two
       different rotations together; the Keplerian shear in the
       accretion disc only survives if A and B turn independently. */
    vec3 pA = aPosA;
    if (abs(aOrbA) > 0.0001) pA = rotateAxis(pA, uOrbitAxisA, aOrbA * uTime);
    vec3 pB = aPosB;
    if (abs(aOrbB) > 0.0001) pB = rotateAxis(pB, uOrbitAxisB, aOrbB * uTime);

    vec3 pos = mix(pA, pB, m);

    float transit = sin(m * 3.14159265);

    /* --- 3. Swirl: arc the crossing path ---------------------------- */
    if (abs(uSwirl) > 0.001) {
      pos = rotateZ(pos, uSwirl * transit);
    }

    /* --- 4. Scatter + turbulence, both peaking mid-flight ----------- */
    if (transit > 0.001) {
      vec3 outward = normalize(pos + vec3(0.0001));
      pos += outward * transit * uScatter * (0.28 + aRand.y * 1.25);
      vec3 nOff = vec3(
        snoise(pos * 0.32 + vec3(0.0,  uTime * 0.15, 0.0)),
        snoise(pos * 0.32 + vec3(11.3, uTime * 0.15, 4.1)),
        snoise(pos * 0.32 + vec3(23.7, uTime * 0.15, 9.5))
      );
      pos += nOff * transit * uTurb * 0.8;
    }

    /* --- 5. Idle breathing ----------------------------------------- *
       A held shape must never be quite static; this is the whole
       difference between "alive" and "paused". */
    float t = uTime * 0.3 + aRand.z * 6.2831853;
    pos += vec3(
      sin(t + pos.y * 0.55),
      cos(t * 1.13 + pos.x * 0.48),
      sin(t * 0.87 + pos.z * 0.62)
    ) * 0.032;

    /* --- 6. Shape spin --------------------------------------------- *
       Volumetric shapes turn about Y; shapes that lie in the view plane
       turn about the view axis instead, or they tip edge-on as the
       angle accumulates. */
    pos = rotateY(pos, uSpinY);
    pos = rotateZ(pos, uSpinZ);

    /* --- 7. Cursor ------------------------------------------------- */
    vec2 toMouse = pos.xy - uMouse.xy;
    float md = length(toMouse);
    float influence = smoothstep(2.7, 0.0, md);
    pos.xy += normalize(toMouse + vec2(0.0001)) * influence * uMouseForce * 1.15;
    pos.z += influence * uMouseForce * 0.4;

    /* --- 8. Shockwave ---------------------------------------------- *
       Fired by the contact form. A gaussian ring travelling outward,
       so the cloud visibly answers the click. */
    float shock = 0.0;
    if (uPulse > 0.001) {
      float rad = length(pos);
      float front = uPulse * 11.0;
      shock = exp(-pow((rad - front) * 0.85, 2.0)) * uPulse;
      pos += normalize(pos + vec3(0.0001)) * shock * 1.5;
    }

    /* --- 9. Intro assembly ---------------------------------------- */
    pos *= 1.0 + (1.0 - uIntro) * 3.0;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = mix(aSizeA, aSizeB, m);
    // Fast scrolling fattens the grains into short streaks.
    size *= 1.0 + uVelocity * 0.45 + transit * 0.3 + shock * 0.9;
    gl_PointSize = uSize * size * uPixelRatio * (44.0 / max(0.001, -mv.z));

    /* Colour is a straight blend. Everything situational rides on
       alpha — mixing a fade into the colour desaturates it instead. */
    vColor = mix(aColA, aColB, m);

    float flicker = 0.72 + 0.28 * sin(uTime * (1.05 + aRand.y * 2.5) + aRand.z * 12.566);
    // Accent grains twinkle harder; structure grains stay steady so the
    // figure they draw does not shimmer apart.
    flicker = mix(1.0, flicker, 0.35 + aRole * 0.3);

    float depthFade = smoothstep(-32.0, -3.0, mv.z);

    vAlpha = flicker
      * depthFade
      * uIntro
      * (1.0 + transit * 0.22 + shock * 1.2);
  }
`;

export const particleFragmentShader = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float f = 1.0 - d * 2.0;
    /* Two-term profile: a wide soft halo plus a tight core. One term
       alone gives either a blurry dot or a hard pixel; the pair is what
       reads as a glowing grain. */
    float halo = pow(f, 1.7) * 0.5;
    float core = pow(f, 7.0);

    vec3 c = vColor * (halo + core * 1.9);
    gl_FragColor = vec4(c, (halo + core) * vAlpha);
  }
`;

/* ------------------------------------------------------------------ *
 * Deep field — cheap always-on stars behind the subject, on their own
 * parallax so the frame has depth even when the cloud is quiet.
 * ------------------------------------------------------------------ */

export const starVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uParallaxX;
  uniform float uParallaxY;
  uniform float uIntro;

  attribute float aSize;
  attribute float aPhase;
  attribute float aWarm;

  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec3 p = position;
    // Nearer stars swing further — the parallax is what sells depth.
    p.x += uParallaxX * (0.2 + aSize * 0.28);
    p.y += uParallaxY * (0.2 + aSize * 0.28);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    /* A star smaller than a pixel does not render dimmer — it renders
       as nothing, or as flicker. So the size gets a one-pixel floor,
       and anything that had to be inflated to reach it gives back the
       difference in alpha. Depth still reads, and the far field stops
       disappearing. */
    float want = aSize * uPixelRatio * (34.0 / max(0.001, -mv.z));
    float floorPx = uPixelRatio * 1.15;
    gl_PointSize = max(want, floorPx);
    float shrink = clamp(want / floorPx, 0.4, 1.0);

    float twinkle = 0.55 + 0.45 * pow(abs(sin(uTime * 0.32 + aPhase)), 2.0);
    vAlpha = twinkle * shrink * uIntro;
    vWarm = aWarm;
  }
`;

export const starFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float f = 1.0 - d * 2.0;

    // Same two-term profile as the main cloud: a wide halo plus a tight
    // core. A single pow() gives either a blurry smudge or a hard dot;
    // the pair is what reads as a star.
    float halo = pow(f, 1.9) * 0.4;
    float core = pow(f, 6.0);
    float a = halo + core;

    // A scattering of warm stars stops the deep field reading as one
    // flat blue wash.
    vec3 cool = vec3(0.80, 0.87, 1.0);
    vec3 warm = vec3(1.0, 0.88, 0.72);
    // Pushed past 1.0 so the brighter stars clear the bloom threshold
    // and actually throw light, instead of sitting flat on the black.
    vec3 c = mix(cool, warm, vWarm) * (halo + core * 1.7) * 1.35;

    gl_FragColor = vec4(c, a * vAlpha);
  }
`;
