"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

import type { Metric } from "@/lib/content";
import { view } from "@/lib/state";

interface Props {
  metrics: Metric[];
  index: number;
}

/**
 * Metric grid with a count-up driven by the scroll engine's active
 * section event.
 *
 * An IntersectionObserver would be the obvious choice and is the wrong
 * one here: on 190vh sections it fires roughly a screen early, so the
 * numbers have finished counting before anyone can see them.
 */
export default function Metrics({ metrics, index }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-count]"));
    const targets = nodes.map((n) => Number(n.dataset.count));
    const decimals = nodes.map((n) => {
      const raw = n.dataset.count ?? "0";
      const dot = raw.indexOf(".");
      return dot === -1 ? 0 : raw.length - dot - 1;
    });

    const settle = () => {
      nodes.forEach((n, i) => {
        n.textContent = targets[i].toFixed(decimals[i]);
      });
    };

    if (view.reduced) {
      settle();
      return;
    }

    const play = () => {
      nodes.forEach((n, i) => {
        const obj = { v: 0 };
        gsap.killTweensOf(obj);
        gsap.to(obj, {
          v: targets[i],
          duration: 1.5,
          delay: i * 0.09,
          ease: "power3.out",
          onUpdate() {
            n.textContent = obj.v.toFixed(decimals[i]);
          },
          onComplete() {
            n.textContent = targets[i].toFixed(decimals[i]);
          },
        });
      });
    };

    const reset = () => {
      nodes.forEach((n, i) => {
        n.textContent = (0).toFixed(decimals[i]);
      });
    };

    const onSection = (e: Event) => {
      if ((e as CustomEvent<number>).detail === index) play();
      else reset();
    };

    reset();
    document.addEventListener("astera:section", onSection);
    return () => document.removeEventListener("astera:section", onSection);
  }, [index, metrics.length]);

  return (
    <div className="metrics" ref={root}>
      {metrics.map((m) => (
        <div className="metric" key={m.label}>
          <div className="metric-value">
            <span data-count={m.value}>0</span>
            {m.suffix ? <em>{m.suffix}</em> : null}
          </div>
          <div className="metric-label">{m.label}</div>
          <div className="metric-note">{m.note}</div>
        </div>
      ))}
    </div>
  );
}
