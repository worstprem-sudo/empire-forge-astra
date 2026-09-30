"use client";

import { useEffect, useRef } from "react";

import { damp, view } from "@/lib/state";

/**
 * Two-part cursor: a dot pinned to the pointer and a ring that lags
 * behind it. The lag is the whole effect — a ring that tracks exactly
 * is just a bigger cursor.
 *
 * Only mounted on devices with a real pointer, and never under reduced
 * motion; in both of those cases the native cursor is left alone.
 */
export default function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    document.body.dataset.cursor = "on";

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let rx = x;
    let ry = y;
    let raf = 0;
    let last = performance.now();
    let hot = false;

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;

      // One hit test per move, not per frame.
      const el = e.target as HTMLElement | null;
      const next = !!el?.closest(
        "a, button, input, [data-interactive], [role='button']"
      );
      if (next !== hot) {
        hot = next;
        view.hot = next;
        if (ring.current) ring.current.dataset.hot = String(next);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      rx = damp(rx, x, 11, dt);
      ry = damp(ry, y, 11, dt);
      if (dot.current) {
        dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      if (ring.current) {
        ring.current.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      delete document.body.dataset.cursor;
    };
  }, []);

  return (
    <>
      <div className="cursor" ref={dot} aria-hidden="true" />
      <div className="cursor-ring" ref={ring} aria-hidden="true" />
    </>
  );
}
