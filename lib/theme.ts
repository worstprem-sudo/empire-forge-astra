/**
 * Colour constants shared by the canvas and the DOM chrome.
 *
 * Kept in their own module with no three.js import so the preloader,
 * nav and footer can match the canvas exactly while the WebGL bundle
 * stays code-split.
 */

/** Page + canvas clear colour. Additive blending needs this near-black. */
export const BACKGROUND = "#04050a";

/**
 * Particle palette, as HSL triples (h 0..1, s 0..1, l 0..1).
 *
 * Deliberately warmer than the usual blue/violet space palette: the
 * gold accent is what stops the whole page reading as one hue, and
 * under ACES it resolves to convincing starlight rather than amber.
 */
export const PALETTE = {
  ice: [0.585, 0.82, 0.72] as const,
  azure: [0.615, 0.9, 0.6] as const,
  violet: [0.71, 0.72, 0.68] as const,
  teal: [0.46, 0.72, 0.62] as const,
  gold: [0.095, 0.78, 0.72] as const,
  ember: [0.045, 0.85, 0.6] as const,
  white: [0.6, 0.16, 0.94] as const,
};

export type PaletteKey = keyof typeof PALETTE;

/**
 * Bloom's luminance threshold is set from the backdrop, not by eye:
 * comfortably above the ambient field so it never blooms into itself.
 */
export const BLOOM_THRESHOLD = 0.055;
