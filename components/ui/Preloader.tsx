"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";

import { BRAND, TAGLINE } from "@/lib/content";
import { SHAPES } from "@/lib/shapes";
import { view } from "@/lib/state";
import Mark from "./Mark";

const DIGITS = [0, 1, 2];

/**
 * Holds the frame while shape buffers are generated, then hands off to
 * the intro tween that assembles the cloud.
 *
 * The handoff overlaps deliberately: the curtain starts clearing while
 * the cloud is still collapsing inward, so loading and the first
 * animation are one continuous motion rather than a spinner followed
 * by a scene.
 */
export default function Preloader() {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const strips = useRef<(HTMLElement | null)[]>([]);
  const status = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const finish = () => {
      view.intro = 1;
      view.ready = true;
      document.documentElement.style.removeProperty("overflow");
      document.dispatchEvent(new CustomEvent("astera:ready"));
      setMounted(false);
    };

    if (reduced) {
      finish();
      return;
    }

    document.documentElement.style.overflow = "hidden";

    const counter = { n: 0 };
    const intro = { v: 0 };
    let lastLabel = -1;

    const tl = gsap.timeline();

    tl.to(counter, {
      n: 100,
      duration: 1.9,
      ease: "power2.inOut",
      onUpdate() {
        const v = Math.round(counter.n);
        const d = [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
        for (let i = 0; i < 3; i++) {
          const strip = strips.current[i];
          // Each strip is ten stacked cells of 0.82em; sliding it is
          // what makes the count read as a mechanism rather than a
          // flickering textContent swap.
          if (strip) strip.style.transform = `translateY(${-d[i] * 0.82}em)`;
        }
        if (bar.current) bar.current.style.transform = `scaleX(${v / 100})`;

        const idx = Math.min(SHAPES.length - 1, Math.floor((v / 100) * SHAPES.length));
        if (idx !== lastLabel && status.current) {
          lastLabel = idx;
          status.current.textContent = SHAPES[idx].label;
        }
      },
    })
      .to(
        root.current,
        {
          clipPath: "inset(0% 0% 100% 0%)",
          duration: 1.15,
          ease: "expo.inOut",
        },
        "+=0.16"
      )
      .to(
        intro,
        {
          v: 1,
          duration: 2.1,
          ease: "power2.out",
          onUpdate() {
            view.intro = intro.v;
          },
        },
        "<0.05"
      )
      .add(() => {
        view.ready = true;
        document.documentElement.style.removeProperty("overflow");
        document.dispatchEvent(new CustomEvent("astera:ready"));
      }, "<0.5")
      .add(() => setMounted(false));

    return () => {
      tl.kill();
      document.documentElement.style.removeProperty("overflow");
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      ref={root}
      className="preloader"
      style={{ clipPath: "inset(0% 0% 0% 0%)" }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="pre-top">
        <span className="brand" style={{ padding: 0 }}>
          <Mark className="brand-mark" />
          {BRAND}
        </span>
        <span className="mono-label">WebGL — 152k points</span>
      </div>

      <div className="pre-mid">
        <div className="odo" aria-hidden="true">
          {DIGITS.map((i) => (
            <span className="odo-digit" key={i}>
              <span
                className="odo-strip"
                ref={(el) => {
                  strips.current[i] = el;
                }}
              >
                {Array.from({ length: 10 }, (_, d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          ))}
          <span className="odo-pct">%</span>
        </div>

        <div style={{ display: "grid", gap: "0.4rem", textAlign: "right" }}>
          <span className="mono-label">Assembling</span>
          <span className="mono-label" ref={status} style={{ color: "var(--gold)" }}>
            Drift
          </span>
        </div>
      </div>

      <div className="pre-bottom" style={{ display: "grid", gap: "1rem" }}>
        <div className="pre-bar">
          <i ref={bar} />
        </div>
        <span className="mono-label">{TAGLINE}</span>
      </div>
    </div>
  );
}
