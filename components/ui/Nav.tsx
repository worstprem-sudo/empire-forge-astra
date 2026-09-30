"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BRAND, NAV_LINKS } from "@/lib/content";
import { goto } from "@/lib/nav";
import MagneticButton from "./MagneticButton";
import Mark from "./Mark";

/**
 * Pill nav with a single sliding indicator.
 *
 * The indicator is the point: it tells you which chapter you are in
 * without you having to read the labels, and it is driven by the same
 * scroll event that drives the morph — so it can never disagree with
 * what is on screen.
 */
export default function Nav() {
  const [active, setActive] = useState(-1);
  const [hidden, setHidden] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onSection = (e: Event) => {
      setActive((e as CustomEvent<number>).detail);
    };
    document.addEventListener("astera:section", onSection);
    return () => document.removeEventListener("astera:section", onSection);
  }, []);

  // Tucks away while scrolling down so it never sits over the copy,
  // and comes straight back on any scroll up or near the top.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (y < 80) setHidden(false);
      else if (delta > 4) setHidden(true);
      else if (delta < -4) setHidden(false);
      if (Math.abs(delta) > 4 || y < 80) lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const place = () => {
    const el = indicator.current;
    const host = wrap.current;
    if (!el || !host) return;
    const hit = host.querySelector<HTMLElement>('[data-active="true"]');
    if (!hit) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    el.style.width = `${hit.offsetWidth}px`;
    el.style.transform = `translateX(${hit.offsetLeft}px)`;
  };

  // Layout effect so the indicator is never painted at the wrong
  // position for a frame after the active link changes.
  useLayoutEffect(place, [active]);

  useEffect(() => {
    window.addEventListener("resize", place);
    document.fonts?.ready.then(place).catch(() => {});
    return () => window.removeEventListener("resize", place);
  }, []);

  return (
    <nav
      className="nav"
      aria-label="Primary"
      data-hidden={hidden}
      onFocus={() => setHidden(false)}
    >
      <div className="pill">
        <a
          className="brand"
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            goto(0);
          }}
        >
          <Mark className="brand-mark" />
          {BRAND}
        </a>

        <div className="nav-links" ref={wrap}>
          <span className="nav-indicator" ref={indicator} aria-hidden="true" />
          {NAV_LINKS.map((link) => (
            <button
              key={link.label}
              type="button"
              className="nav-link"
              data-active={active === link.target}
              aria-current={active === link.target ? "true" : undefined}
              onClick={() => goto(link.target)}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>

      <MagneticButton className="btn" onClick={() => goto(5)}>
        Start Copy Trading
        <span className="dot" aria-hidden="true" />
      </MagneticButton>
    </nav>
  );
}
