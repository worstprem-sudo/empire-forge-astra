"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { damp, view } from "@/lib/state";

interface Props {
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  ariaLabel?: string;
  href?: string;
  target?: string;
  rel?: string;
}

/**
 * A button/link that leans toward the pointer.
 *
 * If href is supplied, the component renders an anchor so it can be used
 * for external CTAs such as Telegram. Otherwise it renders a native button.
 */
export default function MagneticButton({
  children,
  className = "btn",
  type = "button",
  onClick,
  ariaLabel,
  href,
  target,
  rel,
}: Props) {
  const el = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node || view.reduced) return;

    let raf = 0;
    let running = false;
    const targetPos = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      current.x = damp(current.x, targetPos.x, 12, dt);
      current.y = damp(current.y, targetPos.y, 12, dt);
      node.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;

      if (
        Math.abs(current.x - targetPos.x) < 0.02 &&
        Math.abs(current.y - targetPos.y) < 0.02 &&
        targetPos.x === 0 &&
        targetPos.y === 0
      ) {
        node.style.transform = "";
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const reach = Math.max(r.width, r.height) * 0.95;
      const dist = Math.hypot(dx, dy);

      if (dist > reach) {
        targetPos.x = 0;
        targetPos.y = 0;
      } else {
        const falloff = 1 - dist / reach;
        targetPos.x = dx * 0.32 * falloff;
        targetPos.y = dy * 0.42 * falloff;
      }
      start();
    };

    const onEnter = () => {
      view.hot = true;
    };
    const onLeave = () => {
      view.hot = false;
      targetPos.x = 0;
      targetPos.y = 0;
      start();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    node.addEventListener("pointerenter", onEnter);
    node.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerenter", onEnter);
      node.removeEventListener("pointerleave", onLeave);
      view.hot = false;
    };
  }, []);

  if (href) {
    return (
      <a
        ref={(node) => { el.current = node; }}
        href={href}
        target={target}
        rel={rel}
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
        data-interactive
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={(node) => { el.current = node; }}
      type={type}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      data-interactive
    >
      {children}
    </button>
  );
}
