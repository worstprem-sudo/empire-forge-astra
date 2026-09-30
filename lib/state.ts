import { SECTIONS } from "./content";
import { SHAPES } from "./shapes";

/**
 * One mutable object shared by the DOM scroll layer and the render
 * loop. Deliberately not React state - every field here changes on
 * most frames, and a re-render at 60 Hz would eat the frame budget.
 */
export const view = {
  /** 0..1 across the whole stage */
  progress: 0,
  /** index of the shape being held / morphed away from */
  shapeIndex: 0,
  /** 0..1 blend from shapeIndex to shapeIndex + 1 */
  morph: 0,
  /** 0..1 raw progress inside the active section, before easing */
  local: 0,

  /** pointer in normalised device coords, -1..1 */
  pointerX: 0,
  pointerY: 0,
  /** eased pointer - what the scene actually follows */
  smoothX: 0,
  smoothY: 0,
  /** true while the pointer is over an interactive element */
  hot: false,

  /** scroll energy, 0..1-ish; topped up by the scroll listener */
  velocity: 0,

  /** shape buffers built and intro played */
  ready: false,
  /** honours prefers-reduced-motion */
  reduced: false,
  /** 0..1 intro assembly */
  intro: 0,


  /** one-shot radial shockwave, fired by the CTA. Decays to 0. */
  pulse: 0,
};

/** Fraction of a section spent holding the shape before it morphs. */
export const HOLD = 0.46;

export const SECTION_COUNT = SHAPES.length;

/**
 * Copy and geometry are index-aligned: section i is told by SECTIONS[i]
 * and shown by SHAPES[i]. If the two lists ever drift, the last shape
 * silently never appears — which looks like a scroll bug, not a data
 * one. Fail loudly in development instead.
 */
if (process.env.NODE_ENV !== "production" && SECTIONS.length !== SHAPES.length) {
  throw new Error(
    `SECTIONS (${SECTIONS.length}) and SHAPES (${SHAPES.length}) must be the same length.`
  );
}

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent easing. A raw lerp(a, b, 0.1) per frame moves
 * twice as fast at 120 Hz as at 60; this does not.
 */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * `raw` is scroll position expressed in section-heights: integer part
 * is the active section, fraction is progress through it. Feeding the
 * mapping in this unit keeps the morph locked to the sticky pin
 * windows however tall the sections end up being.
 */
export function applySectionScroll(raw: number) {
  const r = clamp(raw, 0, SECTION_COUNT);
  const idx = clamp(Math.floor(r), 0, SECTION_COUNT - 1);
  const local = clamp(r - idx, 0, 1);
  view.shapeIndex = idx;
  view.local = local;
  view.morph = smoothstep(HOLD, 1, local);
  view.progress = clamp(r / SECTION_COUNT, 0, 1);
}

/**
 * Visibility curve for a panel's copy. There is no fade-*in* here on
 * purpose: a section's entrance is the GSAP word reveal, and a
 * scroll-driven fade-in would leave the hero invisible at scroll 0.
 */
export function contentVisibility(local: number) {
  return 1 - smoothstep(0.42, 0.68, local);
}
