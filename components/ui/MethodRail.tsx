"use client";

import { useEffect, useRef } from "react";

import type { Step } from "@/lib/content";
import { clamp, damp, view } from "@/lib/state";

interface Props {
  steps: Step[];
  /** the section this rail belongs to */
  index: number;
}

/** The rail finishes its travel before the shape starts morphing. */
const FROM = 0.06;
const TO = 0.44;

/**
 * A horizontal rail scrubbed by the page scroll rather than by its own
 * scrollbar.
 *
 * Two things make it more than a row of cards: the timeline fills as
 * you go, and each card's marker ties it back up to that timeline — so
 * the whole thing reads as one instrument. The travel completes before
 * HOLD expires, so the steps have all landed by the time the object
 * starts to change.
 */
export default function MethodRail({ steps, index }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);

  useEffect(() => {
    const vp = viewport.current;
    const tr = track.current;
    if (!vp || !tr) return;

    let raf = 0;
    let active = false;
    let eased = 0;
    let last = performance.now();
    let lastCard = -1;

    const apply = (p: number) => {
      const overflow = Math.max(0, tr.scrollWidth - vp.clientWidth);
      tr.style.transform = `translate3d(${(-overflow * p).toFixed(2)}px, 0, 0)`;
      if (fill.current) fill.current.style.transform = `scaleX(${p.toFixed(4)})`;

      const card = Math.round(p * (steps.length - 1));
      if (card !== lastCard) {
        lastCard = card;
        const nodes = tr.querySelectorAll<HTMLElement>(".step");
        nodes.forEach((n, i) => {
          n.dataset.active = String(i === card);
        });
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const target = clamp((view.local - FROM) / (TO - FROM), 0, 1);
      // Eased rather than bound directly to scroll: Lenis is already
      // smooth, but the rail travels a long way and the extra damping
      // is what stops it feeling twitchy on a trackpad.
      eased = damp(eased, target, 9, dt);
      apply(eased);
      if (!active && Math.abs(eased - target) < 0.001) return;
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onSection = (e: Event) => {
      const next = (e as CustomEvent<number>).detail === index;
      if (next === active) return;
      active = next;
      start();
    };

    if (view.reduced) {
      // No scrub: show the rail at rest with the first step marked.
      apply(0);
      return;
    }

    document.addEventListener("astera:section", onSection);
    const onResize = () => apply(eased);
    window.addEventListener("resize", onResize);
    apply(0);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("astera:section", onSection);
      window.removeEventListener("resize", onResize);
    };
  }, [index, steps.length]);

  return (
    <div className="method-rail" ref={viewport}>
      <div className="method-timeline">
        <i ref={fill} style={{ transform: "scaleX(0)" }} />
      </div>
      <div className="method-track" ref={track}>
        {steps.map((step, i) => (
          <article className="step" key={step.index} data-active={i === 0}>
            <div className="step-top">
              <span className="step-index">{step.index}</span>
              <span className="step-duration">{step.duration}</span>
            </div>
            <h3 className="step-name">{step.name}</h3>
            <p className="step-detail">{step.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
