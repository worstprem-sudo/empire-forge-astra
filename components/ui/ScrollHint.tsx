"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll affordance. Dismissed by the first real scroll intent rather
 * than on a timer, so it is never still sitting there once the user
 * has clearly understood it — and never disappears before a slow
 * reader has seen it.
 */
export default function ScrollHint() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;

    const hide = () => {
      node.style.opacity = "0";
      cleanup();
    };

    const onSection = (e: Event) => {
      if ((e as CustomEvent<number>).detail !== 0) hide();
    };

    const cleanup = () => {
      window.removeEventListener("wheel", hide);
      window.removeEventListener("touchstart", hide);
      window.removeEventListener("keydown", hide);
      document.removeEventListener("astera:section", onSection);
    };

    window.addEventListener("wheel", hide, { passive: true, once: true });
    window.addEventListener("touchstart", hide, { passive: true, once: true });
    window.addEventListener("keydown", hide, { once: true });
    document.addEventListener("astera:section", onSection);

    return cleanup;
  }, []);

  return (
    <div className="hint" ref={el} aria-hidden="true">
      <span className="mono-label">Scroll</span>
      <span className="hint-line">
        <i />
      </span>
    </div>
  );
}
