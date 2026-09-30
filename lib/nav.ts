import { view } from "./state";

/**
 * Chapter navigation and the one-shot shockwave, both expressed as DOM
 * events rather than shared React state — the scroll engine is the
 * only thing that knows where a section actually starts, and nothing
 * needs to re-render for either of these to happen.
 */

export function goto(index: number) {
  document.dispatchEvent(new CustomEvent("astera:goto", { detail: index }));
}

/** Fires the radial shockwave through the particle field. */
export function pulse() {
  if (view.reduced) return;
  view.pulse = 1;
}
