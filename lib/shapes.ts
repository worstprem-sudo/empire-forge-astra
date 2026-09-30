import { createNoise3D, gaussian, makeFbm, makeRidged, mulberry32 } from "./noise";

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 * Colour helper — writes an HSL colour with a separate brightness
 * multiplier straight into a packed Float32 buffer. Brightness is kept
 * out of `l` on purpose: under additive blending luminance needs to run
 * well past 1.0 without the hue washing out to white.
 * ------------------------------------------------------------------ */

function hue2rgb(p: number, q: number, t: number) {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function writeHSL(
  col: Float32Array,
  i3: number,
  h: number,
  s: number,
  l: number,
  brightness = 1
) {
  const hh = ((h % 1) + 1) % 1;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  col[i3] = r * brightness;
  col[i3 + 1] = g * brightness;
  col[i3 + 2] = b * brightness;
}

function smooth01(x: number) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type V3 = [number, number, number];

/* Build-time rigid rotations, used to tilt discs into a stage pose.
   The matching orbit axis is derived from the very same constants, so
   the disc and the axis its particles turn about can never drift
   apart — a mismatch there reads as the disc slowly tipping over. */

function rotX(p: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}

function rotZ(p: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

/* ------------------------------------------------------------------ *
 * Roles
 *
 * A particle's role is fixed by its index and never changes between
 * shapes. A grain that draws a spiral arm also draws a lattice edge, an
 * accretion stream and a stroke of the final mark. That continuity is
 * the whole reason six clouds read as one material rather than six
 * unrelated point sets.
 * ------------------------------------------------------------------ */

export const ROLE_STRUCTURE = 0;
export const ROLE_FIELD = 1;
export const ROLE_ACCENT = 2;

export interface BuildCtx {
  n: number;
  gu: number;
  gv: number;
  pos: Float32Array;
  col: Float32Array;
  siz: Float32Array;
  /** per-particle orbital speed about the shape's own axis, rad/sec */
  orb: Float32Array;
  role: Uint8Array;
  /** stable 0..1 per particle, shared by every shape */
  jit: Float32Array;
  rnd: () => number;
  fbm: (x: number, y: number, z: number) => number;
  ridged: (x: number, y: number, z: number) => number;
}

export interface ShapeDef {
  id: string;
  label: string;
  /** idle rotation about world Y, rad/sec */
  spinY: number;
  /** idle rotation about the view axis, rad/sec */
  spinZ: number;
  camZ: number;
  mouseForce: number;
  /** outward bow while LEAVING this shape */
  scatter: number;
  /** spread of per-particle start times, 0..0.9 */
  stagger: number;
  /** arc angle of the crossing path, radians */
  swirl: number;
  /** simplex turbulence mid-flight */
  turbulence: number;
  /** normal of the plane that `orb` rotates particles in */
  orbitAxis: readonly [number, number, number];
  build: (ctx: BuildCtx) => void;
}

/* ================================================================== *
 * 01 — DRIFT
 *
 * A barred spiral seen at a shallow angle. Two details do the work.
 * The bar: arms leave the core along a straight rod rather than from a
 * point, which is what stops it reading as a bathwater swirl. And
 * differential rotation: `orb` falls off with radius, so the arms
 * shear as you watch. A uniform ring speed always looks like a CD.
 * ================================================================== */

const DRIFT_TILT_X = 0.52;
const DRIFT_TILT_Z = -0.2;

function driftPose(p: V3): V3 {
  return rotZ(rotX(p, DRIFT_TILT_X), DRIFT_TILT_Z);
}

const DRIFT_AXIS = driftPose([0, 1, 0]);

const drift: ShapeDef = {
  id: "drift",
  label: "Drift",
  spinY: 0,
  spinZ: 0,
  camZ: 9.6,
  mouseForce: 0.62,
  scatter: 0.85,
  stagger: 0.36,
  swirl: 0.9,
  turbulence: 0.8,
  orbitAxis: DRIFT_AXIS,
  build({ n, gu, gv, pos, col, siz, orb, role, jit, rnd, fbm }) {
    const RBAR = 1.12;
    const RMAX = 4.35;
    const PITCH = 0.44;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const u = (i % gu) / gu;
      const v = ((i / gu) | 0) / (gv - 1);
      const r0 = role[i];

      let x: number;
      let y: number;
      let z: number;
      let r: number;
      let hue: number;
      let sat: number;
      let lum: number;
      let bright: number;
      let size: number;

      if (r0 === ROLE_STRUCTURE) {
        const arm = i & 1;
        // Concentrated toward the core, the way a real disc is.
        r = 0.16 + Math.pow(v, 0.68) * RMAX;

        const base = arm * Math.PI + u * 0.0006;
        const theta = r <= RBAR ? base : base + Math.log(r / RBAR) / PITCH;

        // Arm width in world units, widening outward. Dividing by r is
        // what keeps the arm a constant *thickness* rather than a
        // constant angle, which would make it a wedge.
        const width = 0.12 + 0.34 * (r / RMAX);
        const spread = (gaussian(rnd) * width) / Math.max(0.55, r * 0.62);
        const th = theta + spread;

        // Thin disc, puffed into a bulge in the middle.
        const thick = 0.055 + 0.4 * Math.exp(-r * 1.9);

        x = Math.cos(th) * r;
        z = Math.sin(th) * r;
        y = gaussian(rnd) * thick;

        // Star-forming knots along the arms, and a dust lane on the
        // trailing edge that splits each arm into two strands.
        const knot = fbm(x * 0.85, y * 1.4, z * 0.85);
        const lane = smooth01(1 - Math.abs(spread * 3.4 + 0.55));

        const core = smooth01((0.95 - r) / 0.85);
        hue = mix(0.6, 0.668, smooth01(r / RMAX)) - core * 0.5;
        sat = mix(0.86, 0.62, core);
        lum = 0.5 + Math.pow(rnd(), 3) * 0.26 + Math.max(0, knot) * 0.2;
        bright =
          (0.34 + core * 2.5 + Math.max(0, knot) * 0.5) *
          (1 - lane * 0.55) *
          (0.55 + 0.45 * smooth01(1.6 - r / 2.4));
        size = (0.42 + Math.pow(rnd(), 2.6) * 0.85) * (0.7 + core * 0.9);
      } else if (r0 === ROLE_FIELD) {
        // Exponential halo. Gives the disc a floor between the arms so
        // the gaps read as dust rather than as missing geometry.
        r = 0.22 - Math.log(1 - rnd() * 0.985) * 1.35;
        if (r > 5.6) r = 5.6;
        const th = rnd() * TAU;
        const thick = 0.1 + 0.55 * Math.exp(-r * 1.1);
        x = Math.cos(th) * r;
        z = Math.sin(th) * r;
        y = gaussian(rnd) * thick;

        hue = 0.63 + jit[i] * 0.06;
        sat = 0.72;
        lum = 0.44 + jit[i] * 0.2;
        bright = 0.1 + 0.5 * Math.exp(-r * 0.6);
        size = 0.28 + Math.pow(rnd(), 3) * 0.42;
      } else {
        // Foreground stars, weighted onto the arms.
        const arm = i & 1;
        r = 0.3 + Math.pow(rnd(), 0.55) * RMAX * 1.05;
        const base = arm * Math.PI;
        const theta = r <= RBAR ? base : base + Math.log(r / RBAR) / PITCH;
        const th = theta + gaussian(rnd) * 0.34;
        x = Math.cos(th) * r;
        z = Math.sin(th) * r;
        y = gaussian(rnd) * (0.09 + 0.35 * Math.exp(-r * 1.5));

        const warm = rnd();
        hue = warm > 0.62 ? 0.09 + jit[i] * 0.03 : 0.6 + jit[i] * 0.05;
        sat = warm > 0.62 ? 0.66 : 0.5;
        lum = 0.72 + rnd() * 0.24;
        bright = 0.9 + Math.pow(rnd(), 4) * 3.2;
        size = 0.55 + Math.pow(rnd(), 3.2) * 1.5;
      }

      const p = driftPose([x, y, z]);
      pos[i3] = p[0];
      pos[i3 + 1] = p[1];
      pos[i3 + 2] = p[2];

      writeHSL(col, i3, hue, sat, lum, bright);
      siz[i] = size;

      // Differential rotation — inner material sweeps round far faster
      // than the rim, so the arms wind while you look at them.
      orb[i] = 0.42 / (0.62 + r * 0.72);
    }
  },
};

/* ================================================================== *
 * 02 — LATTICE
 *
 * A frequency-2 geodesic cage. This is the section about structure, so
 * the object is literally one: 120 great-circle edges with dense
 * luminous nodes where they meet.
 * ================================================================== */

interface Geodesic {
  verts: V3[];
  edges: [number, number][];
}

function buildGeodesic(): Geodesic {
  const t = (1 + Math.sqrt(5)) / 2;
  const base: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const faces: V3[] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const verts: V3[] = base.map((p) => {
    const l = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / l, p[1] / l, p[2] / l];
  });

  const cache = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? a + "_" + b : b + "_" + a;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const va = verts[a];
    const vb = verts[b];
    const m: V3 = [
      (va[0] + vb[0]) / 2,
      (va[1] + vb[1]) / 2,
      (va[2] + vb[2]) / 2,
    ];
    const l = Math.hypot(m[0], m[1], m[2]);
    m[0] /= l;
    m[1] /= l;
    m[2] /= l;
    verts.push(m);
    const idx = verts.length - 1;
    cache.set(key, idx);
    return idx;
  };

  const out: V3[] = [];
  for (const f of faces) {
    const ab = midpoint(f[0], f[1]);
    const bc = midpoint(f[1], f[2]);
    const ca = midpoint(f[2], f[0]);
    out.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]);
  }

  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const f of out) {
    const pairs: [number, number][] = [
      [f[0], f[1]],
      [f[1], f[2]],
      [f[2], f[0]],
    ];
    for (const [a, b] of pairs) {
      const key = a < b ? a + "_" + b : b + "_" + a;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }

  return { verts, edges };
}

const lattice: ShapeDef = {
  id: "lattice",
  label: "Lattice",
  spinY: 0.085,
  spinZ: 0.012,
  camZ: 8.4,
  mouseForce: 0.5,
  scatter: 1.15,
  stagger: 0.44,
  swirl: -1.25,
  turbulence: 1.15,
  orbitAxis: [0, 1, 0],
  build({ n, pos, col, siz, orb, role, jit, rnd, fbm }) {
    const R = 2.86;
    const geo = buildGeodesic();
    const E = geo.edges.length;
    const V = geo.verts.length;

    let structureSeen = 0;
    let accentSeen = 0;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const r0 = role[i];

      let x: number;
      let y: number;
      let z: number;
      let hue: number;
      let sat: number;
      let lum: number;
      let bright: number;
      let size: number;

      if (r0 === ROLE_STRUCTURE) {
        const k = structureSeen++;
        const [ea, eb] = geo.edges[k % E];
        const va = geo.verts[ea];
        const vb = geo.verts[eb];
        // Alternate direction on each pass over the edge list so the
        // per-particle jitter inks edges evenly instead of clumping.
        const t = ((k / E) | 0) % 2 === 0 ? jit[i] : 1 - jit[i];

        // Normalising the interpolation projects onto the sphere: a
        // great-circle arc, which is what makes the cage look inflated
        // rather than faceted.
        let mx = va[0] + (vb[0] - va[0]) * t;
        let my = va[1] + (vb[1] - va[1]) * t;
        let mz = va[2] + (vb[2] - va[2]) * t;
        const l = Math.hypot(mx, my, mz) || 1;
        mx /= l;
        my /= l;
        mz /= l;

        // Node bias — grains pack toward the joints, so the cage reads
        // as a built object instead of a wireframe render.
        const nodeT = Math.abs(t - 0.5) * 2;
        const rr = R + gaussian(rnd) * 0.022;

        x = mx * rr;
        y = my * rr;
        z = mz * rr;

        const band = fbm(mx * 1.9, my * 1.9, mz * 1.9);
        const capT = Math.pow(Math.abs(my), 1.6);
        // Teal at the waist, ice through the middle, violet at the caps.
        hue = mix(mix(0.5, 0.585, smooth01(Math.abs(my) * 1.5)), 0.705, capT);
        sat = 0.66 + capT * 0.1;
        lum = 0.7 + rnd() * 0.2;
        bright = (0.62 + nodeT * 1.55) * (0.82 + band * 0.28);
        size = 0.34 + nodeT * 0.4 + Math.pow(rnd(), 3) * 0.35;
      } else if (r0 === ROLE_FIELD) {
        // A dim inner shell, so the cage has an inside and never reads
        // as a flat ring however it happens to be turned.
        const th = rnd() * TAU;
        const ph = Math.acos(1 - 2 * rnd());
        const inner = R * (0.3 + rnd() * 0.3);
        const sp = Math.sin(ph);
        x = sp * Math.cos(th) * inner;
        y = Math.cos(ph) * inner;
        z = sp * Math.sin(th) * inner;

        hue = 0.6 + jit[i] * 0.08;
        sat = 0.78;
        lum = 0.5;
        bright = 0.16 + Math.pow(rnd(), 2) * 0.3;
        size = 0.24 + Math.pow(rnd(), 3) * 0.36;
      } else {
        // Nodes: tight gold clusters sitting exactly on the vertices.
        const k = accentSeen++;
        const vtx = geo.verts[k % V];
        const s = 0.055;
        x = vtx[0] * R + gaussian(rnd) * s;
        y = vtx[1] * R + gaussian(rnd) * s;
        z = vtx[2] * R + gaussian(rnd) * s;

        hue = 0.098 + jit[i] * 0.02;
        sat = 0.6;
        lum = 0.82;
        bright = 1.5 + Math.pow(rnd(), 3) * 2.4;
        size = 0.5 + Math.pow(rnd(), 3) * 1.1;
      }

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      writeHSL(col, i3, hue, sat, lum, bright);
      siz[i] = size;
      orb[i] = 0;
    }
  },
};

/* ================================================================== *
 * 03 — FLUX
 *
 * A trefoil drawn as a tube: one closed path that crosses itself and
 * never ends, which is the honest picture of a process that keeps
 * running. Beads of brightness travel the arclength so the eye reads a
 * direction of flow.
 *
 * The parametrisation matters more than it looks. The obvious
 * (p, q) torus-knot form projects to an unbalanced tangle from a fixed
 * camera — it is only legible if you can orbit it. This form has
 * genuine three-fold symmetry about z, so face-on it reads as one
 * deliberate figure, and it stays that figure while it turns.
 * ================================================================== */

const FLUX_TILT_X = 0.3;

function fluxPose(p: V3): V3 {
  return rotX(p, FLUX_TILT_X);
}

const flux: ShapeDef = {
  id: "flux",
  label: "Flux",
  spinY: 0,
  // Turns about the view axis, so the three-fold figure stays face-on
  // and legible. Spinning about Y would tip it edge-on within a minute.
  spinZ: 0.045,
  camZ: 9.6,
  mouseForce: 0.6,
  scatter: 0.55,
  stagger: 0.5,
  swirl: 1.55,
  turbulence: 0.7,
  orbitAxis: [0, 0, 1],
  build({ n, pos, col, siz, orb, role, rnd }) {
    const SCALE = 0.82;
    /** Golden ratio, used as a low-discrepancy step along the curve. */
    const PHI = 0.618033988749895;

    // Classic trefoil. x and y span about +/-3, z only +/-1, so the
    // knot lies fairly flat and its over/unders stay readable.
    const curve = (t: number): V3 =>
      fluxPose([
        (Math.sin(t) + 2 * Math.sin(2 * t)) * SCALE,
        (Math.cos(t) - 2 * Math.cos(2 * t)) * SCALE,
        -Math.sin(3 * t) * SCALE,
      ]);

    const tangent = (t: number): V3 => {
      const e = 0.0015;
      const a = curve(t - e);
      const b = curve(t + e);
      const x = b[0] - a[0];
      const y = b[1] - a[1];
      const z = b[2] - a[2];
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };

    const TUBE = 0.19;
    let seen = 0;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const r0 = role[i];

      /* Even coverage of the curve without needing to know how many
         particles each role will get: a golden-ratio sequence fills the
         parameter range uniformly at any count. Sampling t from a plain
         uniform random instead leaves visible clumps and gaps. */
      const k = seen++;
      const t = ((k * PHI) % 1) * TAU;

      const c = curve(t);
      const tg = tangent(t);

      /* Offset direction: a gaussian vector with its tangential
         component projected out, which is uniform on the circle
         perpendicular to the curve.

         This replaces a parallel-transport frame entirely. A frame
         built from a fixed reference axis flips wherever the tangent
         passes through that axis, and the kink that put in the tube was
         that discontinuity. With no frame there is nothing to flip. */
      let ox = gaussian(rnd);
      let oy = gaussian(rnd);
      let oz = gaussian(rnd);
      const along = ox * tg[0] + oy * tg[1] + oz * tg[2];
      ox -= tg[0] * along;
      oy -= tg[1] * along;
      oz -= tg[2] * along;
      let ol = Math.hypot(ox, oy, oz);
      if (ol < 1e-5) {
        // Degenerate only if the gaussian landed on the tangent line.
        ox = -tg[1];
        oy = tg[0];
        oz = 0;
        ol = Math.hypot(ox, oy, oz) || 1;
      }
      ox /= ol;
      oy /= ol;
      oz /= ol;

      /* Nine beads — a multiple of three, so the pattern lands on the
         knot's own symmetry and closes cleanly at t = 2*PI. */
      const bead = Math.pow(0.5 + 0.5 * Math.sin(t * 9), 3.4);
      const around = Math.cos(3 * t) * 0.5 + 0.5;

      let hue: number;
      let sat: number;
      let lum: number;
      let bright: number;
      let size: number;
      let rad: number;

      if (r0 === ROLE_STRUCTURE) {
        // Hollow tube: grains sit on the skin, not through the middle.
        rad = TUBE * (0.82 + Math.pow(rnd(), 0.5) * 0.26);
        hue = mix(0.5, 0.7, around);
        sat = 0.7;
        lum = 0.68 + rnd() * 0.18;
        bright = 0.55 + bead * 2.2;
        size = 0.34 + bead * 0.5 + Math.pow(rnd(), 3) * 0.28;
      } else if (r0 === ROLE_FIELD) {
        // A close sheath. Wider than this and the knot disappears into
        // its own fog.
        rad = TUBE * (1.1 + Math.pow(rnd(), 2) * 1.6);
        hue = mix(0.52, 0.69, around);
        sat = 0.8;
        lum = 0.5;
        bright = (0.07 + bead * 0.26) * (0.4 + rnd() * 0.6);
        size = 0.22 + Math.pow(rnd(), 3) * 0.34;
      } else {
        rad = TUBE * (0.1 + rnd() * 0.55);
        hue = bead > 0.45 ? 0.1 : 0.47;
        sat = 0.58;
        lum = 0.84;
        bright = 0.65 + bead * 3.9;
        size = 0.42 + bead * 0.8 + Math.pow(rnd(), 3) * 0.45;
      }

      pos[i3] = c[0] + ox * rad;
      pos[i3 + 1] = c[1] + oy * rad;
      pos[i3 + 2] = c[2] + oz * rad;

      writeHSL(col, i3, hue, sat, lum, bright);
      siz[i] = size;
      orb[i] = 0;
    }
  },
};

/* ================================================================== *
 * 04 — HORIZON
 *
 * An accretion disc around a black hole. Three separate populations
 * make this read as gravity rather than as a donut:
 *
 *   - the disc, with Keplerian shear and relativistic beaming, so one
 *     limb is brilliant and the other nearly extinguished;
 *   - the photon ring, a hairline circle sitting in the *view* plane
 *     rather than the disc plane — the signature of light going round
 *     the hole before it reaches you;
 *   - the lensed halo above and below the shadow.
 *
 * The disc's inner radius is chosen so its projected minor axis clears
 * the shadow. Get that wrong and grains sit inside the hole, which
 * kills the illusion instantly.
 * ================================================================== */

const HORIZON_TILT_X = 1.05;
const HORIZON_TILT_Z = 0.1;

function horizonPose(p: V3): V3 {
  return rotZ(rotX(p, HORIZON_TILT_X), HORIZON_TILT_Z);
}

const HORIZON_AXIS = horizonPose([0, 1, 0]);

/** Angle, in the disc's own frame, where material is coming at you. */
const BEAM = -0.62;

const horizon: ShapeDef = {
  id: "horizon",
  label: "Horizon",
  spinY: 0,
  spinZ: 0.008,
  camZ: 9.2,
  mouseForce: 0.42,
  scatter: 0.5,
  stagger: 0.3,
  swirl: 2.1,
  turbulence: 0.55,
  orbitAxis: HORIZON_AXIS,
  build({ n, gu, gv, pos, col, siz, orb, role, jit, rnd, fbm }) {
    const RIN = 1.52;
    const ROUT = 5.0;
    const SHADOW = 1.05;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const u = (i % gu) / gu;
      const v = ((i / gu) | 0) / (gv - 1);
      const r0 = role[i];

      let hue: number;
      let sat: number;
      let lum: number;
      let bright: number;
      let size: number;
      let p: V3;
      let orbit = 0;

      if (r0 === ROLE_STRUCTURE) {
        const r = RIN + Math.pow(v, 1.55) * (ROUT - RIN);
        // A trailing density wave: the disc is streaked, not smooth.
        const th = u * TAU + Math.log(r / RIN) * 1.15 + gaussian(rnd) * 0.05;
        const y = gaussian(rnd) * (0.028 + 0.048 * r);

        const x = Math.cos(th) * r;
        const z = Math.sin(th) * r;
        p = horizonPose([x, y, z]);

        // Relativistic beaming — the approaching limb is boosted hard,
        // the receding one all but extinguished. This asymmetry is the
        // single strongest cue that the disc is *moving*.
        const beam = Math.max(0.06, 1 + 1.95 * Math.cos(th - BEAM));
        const hot = smooth01((2.7 - r) / 1.7);
        const grain = fbm(x * 0.7, y * 3, z * 0.7);

        hue = mix(0.63, 0.6, hot) - hot * 0.42;
        sat = mix(0.86, 0.5, hot);
        lum = 0.56 + hot * 0.24 + Math.pow(rnd(), 3) * 0.18;
        bright = Math.pow(beam, 1.5) * (0.2 + hot * 1.5) * (0.75 + grain * 0.4);
        size = 0.32 + hot * 0.3 + Math.pow(rnd(), 3) * 0.5;

        // Keplerian: the inner edge laps the rim many times over.
        orbit = 2.0 / Math.pow(r, 1.5);
      } else if (r0 === ROLE_FIELD) {
        if (jit[i] < 0.52) {
          // Lensed halo: an image of the disc's far side, wrapped over
          // and under the shadow. It lives in the view plane, so it is
          // deliberately *not* run through horizonPose.
          const ang = rnd() * TAU;
          const rr = 1.46 + Math.pow(rnd(), 2.1) * 1.05;
          p = [
            Math.cos(ang) * rr,
            Math.sin(ang) * rr,
            gaussian(rnd) * 0.14,
          ];
          // Brightest where the lensed image piles up, top and bottom.
          const pile = Math.pow(Math.abs(Math.sin(ang)), 1.4);
          const beam = Math.max(0.1, 1 + 1.2 * Math.cos(ang - BEAM));
          hue = 0.605;
          sat = 0.62;
          lum = 0.72;
          bright = 0.28 * pile * beam;
          size = 0.24 + Math.pow(rnd(), 3) * 0.3;
        } else {
          // Cold outer dust in the disc plane.
          const rr = ROUT + Math.pow(rnd(), 1.4) * 3.6;
          const ang = rnd() * TAU;
          p = horizonPose([
            Math.cos(ang) * rr,
            gaussian(rnd) * (0.1 + 0.1 * rr),
            Math.sin(ang) * rr,
          ]);
          hue = 0.655 + jit[i] * 0.04;
          sat = 0.8;
          lum = 0.46;
          bright = 0.075 * Math.max(0.12, 1 + 1.2 * Math.cos(ang - BEAM));
          size = 0.2 + Math.pow(rnd(), 3) * 0.34;
          orbit = 2.0 / Math.pow(rr, 1.5);
        }
      } else {
        if (jit[i] < 0.66) {
          // Photon ring — hairline, in the view plane, very bright.
          const ang = rnd() * TAU;
          const rr = SHADOW * 1.115 + gaussian(rnd) * 0.014;
          p = [Math.cos(ang) * rr, Math.sin(ang) * rr, gaussian(rnd) * 0.03];
          const beam = Math.max(0.12, 1 + 1.35 * Math.cos(ang - BEAM));
          hue = 0.58;
          sat = 0.3;
          lum = 0.92;
          bright = 1.5 * Math.pow(beam, 1.2);
          size = 0.3 + Math.pow(rnd(), 4) * 0.4;
        } else {
          // Polar jet, along the disc axis. Thin, dim, and the only
          // thing in the frame that leaves the plane.
          const dir = rnd() < 0.5 ? 1 : -1;
          const t = 0.35 + Math.pow(rnd(), 1.6) * 5.4;
          const spread = 0.045 + t * 0.075;
          p = horizonPose([
            gaussian(rnd) * spread,
            dir * t,
            gaussian(rnd) * spread,
          ]);
          hue = 0.7;
          sat = 0.7;
          lum = 0.7;
          bright = 0.5 * Math.exp(-t * 0.42);
          size = 0.22 + Math.pow(rnd(), 3) * 0.34;
        }
      }

      pos[i3] = p[0];
      pos[i3 + 1] = p[1];
      pos[i3 + 2] = p[2];
      writeHSL(col, i3, hue, sat, lum, bright);
      siz[i] = size;
      orb[i] = orbit;
    }
  },
};

/* ================================================================== *
 * 05 — BLOOM
 *
 * A supernova remnant, not a starburst. The difference is structure:
 * a ridged-noise shell gives Rayleigh–Taylor fingers, and the ejecta
 * is bundled onto a few hundred discrete rays so it reads as streaks
 * rather than fog. A formless bright blob is the single most common
 * way this kind of section goes wrong.
 * ================================================================== */

const bloom: ShapeDef = {
  id: "bloom",
  label: "Bloom",
  spinY: 0.05,
  spinZ: 0.015,
  camZ: 9.0,
  mouseForce: 0.9,
  scatter: 1.5,
  stagger: 0.24,
  swirl: -0.7,
  turbulence: 1.5,
  orbitAxis: [0, 1, 0],
  build({ n, gu, gv, pos, col, siz, orb, role, jit, rnd, fbm, ridged }) {
    const R = 2.62;
    const RAYS = 240;
    let fieldSeen = 0;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const u = (i % gu) / gu;
      const v = ((i / gu) | 0) / (gv - 1);
      const r0 = role[i];

      let x: number;
      let y: number;
      let z: number;
      let hue: number;
      let sat: number;
      let lum: number;
      let bright: number;
      let size: number;

      if (r0 === ROLE_STRUCTURE) {
        const theta = u * TAU;
        const phi = Math.acos(1 - 2 * v);
        const sp = Math.sin(phi);
        const nx = sp * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = sp * Math.sin(theta);

        // Crests push outward as fingers; troughs stay near the shell.
        const crest = ridged(nx * 2.4, ny * 2.4, nz * 2.4);
        const fine = fbm(nx * 5.2, ny * 5.2, nz * 5.2);
        const rr = R * (1 + Math.max(0, crest) * 0.42 + fine * 0.09);

        x = nx * rr;
        y = ny * rr;
        z = nz * rr;

        // Limb brightening: looking edge-on through the shell near the
        // silhouette stacks far more material than looking at its face.
        const limb = Math.pow(1 - Math.abs(nz), 1.8);
        const hotCrest = Math.max(0, crest);

        hue = mix(0.685, 0.075, Math.pow(hotCrest, 1.4));
        sat = mix(0.74, 0.66, hotCrest);
        lum = 0.6 + Math.pow(rnd(), 3) * 0.26;
        bright = (0.22 + limb * 1.7) * (0.5 + hotCrest * 1.7);
        size = 0.3 + limb * 0.36 + Math.pow(rnd(), 3) * 0.4;
      } else if (r0 === ROLE_FIELD) {
        // Ejecta bundled onto discrete rays. The golden-angle spiral
        // spaces the ray directions evenly over the sphere without any
        // clumping at the poles.
        const k = fieldSeen++;
        const ray = k % RAYS;
        const yy = 1 - (2 * ray + 1) / RAYS;
        const rr2 = Math.sqrt(Math.max(0, 1 - yy * yy));
        const phi = ray * 2.399963;
        const dx = rr2 * Math.cos(phi);
        const dy = yy;
        const dz = rr2 * Math.sin(phi);

        const t = Math.pow(rnd(), 0.7);
        const dist = 0.35 + t * 4.5;
        const jitter = 0.015 + t * 0.075;

        x = dx * dist + gaussian(rnd) * jitter;
        y = dy * dist + gaussian(rnd) * jitter;
        z = dz * dist + gaussian(rnd) * jitter;

        hue = mix(0.585, 0.7, t);
        sat = 0.76;
        lum = 0.58 + jit[i] * 0.2;
        bright = 0.55 * Math.exp(-t * 1.9) + 0.05;
        size = 0.22 + Math.pow(rnd(), 3) * 0.4;
      } else {
        if (jit[i] < 0.22) {
          // The compact remnant left behind at the centre.
          const th = rnd() * TAU;
          const ph = Math.acos(1 - 2 * rnd());
          const rr = Math.pow(rnd(), 2) * 0.34;
          const sp2 = Math.sin(ph);
          x = sp2 * Math.cos(th) * rr;
          y = Math.cos(ph) * rr;
          z = sp2 * Math.sin(th) * rr;
          hue = 0.1;
          sat = 0.32;
          lum = 0.95;
          bright = 3.2 + Math.pow(rnd(), 2) * 3.5;
          size = 0.6 + Math.pow(rnd(), 3) * 1.3;
        } else {
          // Sparks thrown clear of the shell.
          const th = rnd() * TAU;
          const ph = Math.acos(1 - 2 * rnd());
          const rr = 0.5 + Math.pow(rnd(), 0.65) * 4.7;
          const sp2 = Math.sin(ph);
          x = sp2 * Math.cos(th) * rr;
          y = Math.cos(ph) * rr;
          z = sp2 * Math.sin(th) * rr;
          hue = rnd() > 0.55 ? 0.095 : 0.6;
          sat = 0.6;
          lum = 0.85;
          bright = (0.7 + Math.pow(rnd(), 4) * 3.4) * Math.exp(-rr * 0.24);
          size = 0.4 + Math.pow(rnd(), 3.4) * 1.2;
        }
      }

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      writeHSL(col, i3, hue, sat, lum, bright);
      siz[i] = size;
      orb[i] = 0.05;
    }
  },
};

/* ================================================================== *
 * 06 — MARK
 *
 * The studio mark: an {8/3} star polygon — one unbroken line that
 * visits all eight points before closing. Everything that has been
 * flying around for five sections lands on it. It is drawn tight, and
 * the eight vertices carry the only really bright grains, so the
 * figure holds together at any size.
 * ================================================================== */

const mark: ShapeDef = {
  id: "mark",
  label: "Mark",
  spinY: 0,
  spinZ: 0.03,
  camZ: 8.3,
  mouseForce: 0.55,
  scatter: 0.4,
  stagger: 0.6,
  swirl: 0.5,
  turbulence: 0.45,
  orbitAxis: [0, 0, 1],
  build({ n, pos, col, siz, orb, role, jit, rnd }) {
    const POINTS = 8;
    const STEP = 3;
    const R = 2.52;
    const RING = 3.4;

    const verts: V3[] = [];
    for (let k = 0; k < POINTS; k++) {
      const a = (k / POINTS) * TAU - Math.PI / 2;
      verts.push([Math.cos(a) * R, Math.sin(a) * R, 0]);
    }

    let structureSeen = 0;
    let accentSeen = 0;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const r0 = role[i];

      let x: number;
      let y: number;
      let z: number;
      let hue: number;
      let sat: number;
      let lum: number;
      let bright: number;
      let size: number;

      if (r0 === ROLE_STRUCTURE) {
        // Each edge runs from vertex e to vertex e + STEP; walking e
        // over 0..7 traces the whole star as one closed path.
        const k = structureSeen++;
        const e = k % POINTS;
        const va = verts[e];
        const vb = verts[(e + STEP) % POINTS];
        const t = ((k / POINTS) | 0) % 2 === 0 ? jit[i] : 1 - jit[i];

        x = va[0] + (vb[0] - va[0]) * t + gaussian(rnd) * 0.028;
        y = va[1] + (vb[1] - va[1]) * t + gaussian(rnd) * 0.028;
        z = gaussian(rnd) * 0.05;

        const up = smooth01((y + R) / (2 * R));
        hue = mix(0.705, 0.578, up);
        sat = 0.42 - up * 0.16;
        lum = 0.82 + rnd() * 0.14;
        bright = 1.05 + Math.pow(rnd(), 3) * 0.9;
        size = 0.32 + Math.pow(rnd(), 3) * 0.42;
      } else if (r0 === ROLE_FIELD) {
        if (jit[i] < 0.5) {
          // The containing circle — a frame for the figure.
          const a = rnd() * TAU;
          const rr = RING + gaussian(rnd) * 0.022;
          x = Math.cos(a) * rr;
          y = Math.sin(a) * rr;
          z = gaussian(rnd) * 0.04;
          hue = 0.6;
          sat = 0.4;
          lum = 0.8;
          bright = 0.26 + Math.pow(rnd(), 3) * 0.3;
          size = 0.22 + Math.pow(rnd(), 3) * 0.26;
        } else {
          // Faint residue still settling toward the mark.
          const a = rnd() * TAU;
          const rr = Math.pow(rnd(), 0.6) * 5.2;
          x = Math.cos(a) * rr;
          y = Math.sin(a) * rr;
          z = gaussian(rnd) * 0.5;
          hue = 0.63 + jit[i] * 0.07;
          sat = 0.78;
          lum = 0.55;
          bright = 0.075 + 0.16 * Math.exp(-rr * 0.5);
          size = 0.2 + Math.pow(rnd(), 3) * 0.3;
        }
      } else {
        if (jit[i] < 0.86) {
          // The eight points.
          const k = accentSeen++;
          const vtx = verts[k % POINTS];
          const s = 0.052;
          x = vtx[0] + gaussian(rnd) * s;
          y = vtx[1] + gaussian(rnd) * s;
          z = gaussian(rnd) * 0.035;
          hue = 0.1;
          sat = 0.5;
          lum = 0.9;
          bright = 2.1 + Math.pow(rnd(), 3) * 3.2;
          size = 0.44 + Math.pow(rnd(), 3) * 1.05;
        } else {
          // The centre.
          x = gaussian(rnd) * 0.08;
          y = gaussian(rnd) * 0.08;
          z = gaussian(rnd) * 0.04;
          hue = 0.58;
          sat = 0.2;
          lum = 0.96;
          bright = 2.6 + Math.pow(rnd(), 2) * 2.6;
          size = 0.5 + Math.pow(rnd(), 3) * 1.1;
        }
      }

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      writeHSL(col, i3, hue, sat, lum, bright);
      siz[i] = size;
      orb[i] = 0;
    }
  },
};

/* ------------------------------------------------------------------ */

export const SHAPES: ShapeDef[] = [drift, lattice, flux, horizon, bloom, mark];

export interface ShapeBuffers {
  /** the real particle count, after snapping onto the u/v grid */
  count: number;
  positions: Float32Array[];
  colors: Float32Array[];
  sizes: Float32Array[];
  orbits: Float32Array[];
  roles: Uint8Array;
  /** three stable randoms per particle */
  rand: Float32Array;
}

/**
 * Generates every shape's buffers once, at load, behind the preloader.
 * This is the expensive part of the whole page — a few hundred ms of
 * synchronous work — and the frame loop that follows is nearly free.
 *
 * `request` is a hint: the count is snapped onto the u/v grid so the
 * shapes that rely on grid topology get whole rows.
 */
export function buildShapes(request: number): ShapeBuffers {
  const gu = 216;
  const gv = Math.max(8, Math.round(request / gu));
  const n = gu * gv;

  // Roles, jitter and randoms are shared by every shape and seeded
  // once, so a particle keeps its identity across the whole sequence.
  const shared = mulberry32(0x1f83d9ab);
  const roles = new Uint8Array(n);
  const jit = new Float32Array(n);
  const rand = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = shared();
    roles[i] = r < 0.58 ? ROLE_STRUCTURE : r < 0.86 ? ROLE_FIELD : ROLE_ACCENT;
    jit[i] = shared();
    rand[i * 3] = shared();
    rand[i * 3 + 1] = shared();
    rand[i * 3 + 2] = shared();
  }

  const positions: Float32Array[] = [];
  const colors: Float32Array[] = [];
  const sizes: Float32Array[] = [];
  const orbits: Float32Array[] = [];

  for (let s = 0; s < SHAPES.length; s++) {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const siz = new Float32Array(n);
    const orb = new Float32Array(n);

    // Per-shape seeds, so geometry is byte-identical across reloads
    // and HMR. Unseeded randomness makes visual regressions invisible.
    const rnd = mulberry32(0x9e3779b1 + s * 0x85ebca6b);
    const noise = createNoise3D(mulberry32(0x2545f491 + s * 0x27220a95));
    const fbm = makeFbm(noise, 4);
    const ridged = makeRidged(noise, 5);

    SHAPES[s].build({
      n,
      gu,
      gv,
      pos,
      col,
      siz,
      orb,
      role: roles,
      jit,
      rnd,
      fbm,
      ridged,
    });

    positions.push(pos);
    colors.push(col);
    sizes.push(siz);
    orbits.push(orb);
  }

  return { count: n, positions, colors, sizes, orbits, roles, rand };
}
