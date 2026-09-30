"use client";

import Lenis from "lenis";
import { useEffect } from "react";

import {
  applySectionScroll,
  clamp,
  contentVisibility,
  SECTION_COUNT,
  view,
} from "@/lib/state";

/**
 * Owns smooth scrolling and turns raw scroll into:
 *   - the shape morph (via applySectionScroll)
 *   - per-panel content visibility, written straight to the DOM
 *
 * Renders null. Nothing here goes through React state — this runs on
 * every frame, and a re-render at that rate eats the frame budget.
 */
export default function ScrollEngine() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    view.reduced = reduced;

    let stage: HTMLElement | null = null;
    let panels: HTMLElement[] = [];
    let railFill: HTMLElement | null = null;
    let rail: HTMLElement | null = null;
    let sectionH = 1;
    let stageTop = 0;

    const measure = () => {
      stage = document.getElementById("stage");
      panels = Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"));
      rail = document.querySelector<HTMLElement>("[data-rail]");
      railFill = document.querySelector<HTMLElement>("[data-rail-fill]");
      if (!stage) return;
      stageTop = stage.getBoundingClientRect().top + window.scrollY;
      sectionH = stage.offsetHeight / SECTION_COUNT;
    };

    let lastActive = -1;

    const apply = (scrollY: number) => {
      if (!stage || sectionH <= 0) return;
      const raw = (scrollY - stageTop) / sectionH;
      applySectionScroll(raw);

      if (view.shapeIndex !== lastActive) {
        lastActive = view.shapeIndex;
        document.dispatchEvent(
          new CustomEvent("astera:section", { detail: lastActive })
        );
      }

      for (let i = 0; i < panels.length; i++) {
        const local = clamp(raw - i, 0, 1);
        // A panel is live only once its own section has started.
        // Without this guard every not-yet-reached panel sits at
        // local = 0, which the visibility curve reads as fully visible,
        // and they all paint over the current one.
        const inPlay = raw >= i - 0.001 && raw < i + 1;
        const vis = inPlay ? contentVisibility(local) : 0;

        const el = panels[i];
        el.style.opacity = vis.toFixed(3);
        el.style.transform = `translate3d(0, ${((1 - vis) * 24).toFixed(2)}px, 0)`;
        el.style.filter = vis > 0.995 ? "none" : `blur(${((1 - vis) * 6).toFixed(2)}px)`;
        // Hidden panels stop compositing entirely.
        el.style.visibility = vis < 0.004 ? "hidden" : "visible";
      }

      if (railFill) railFill.style.transform = `scaleY(${view.progress.toFixed(4)})`;
      if (rail) rail.dataset.active = String(view.shapeIndex);
    };

    measure();
    apply(window.scrollY);

    // Pointer feed for the scene. It lives here rather than in the
    // custom cursor so it works whether or not the cursor is mounted.
    const onPointer = (e: PointerEvent) => {
      view.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      view.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    let lenis: Lenis | null = null;
    let rafId = 0;

    const targetFor = (index: number) =>
      stageTop + index * sectionH + sectionH * 0.06;

    const onGoto = (e: Event) => {
      const index = (e as CustomEvent<number>).detail;
      const to = targetFor(clamp(index, 0, SECTION_COUNT - 1));
      if (lenis) lenis.scrollTo(to, { duration: 1.5 });
      else window.scrollTo({ top: to });
    };
    document.addEventListener("astera:goto", onGoto);

    const onReady = () => {
      measure();
      // Replay the reveal for whatever section the page was restored to.
      document.dispatchEvent(
        new CustomEvent("astera:section", { detail: view.shapeIndex })
      );
    };
    document.addEventListener("astera:ready", onReady);

    /* Reduced motion is a genuinely separate path — no Lenis, a passive
       native scroll listener — so it is written out in full rather than
       branched inside the main one, where it would break silently. */
    if (reduced) {
      const onScroll = () => apply(window.scrollY);
      const onResize = () => {
        measure();
        apply(window.scrollY);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      document.fonts?.ready.then(onResize).catch(() => {});
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onPointer);
        document.removeEventListener("astera:goto", onGoto);
        document.removeEventListener("astera:ready", onReady);
      };
    }

    lenis = new Lenis({
      duration: 1.15,
      easing: (t: number) => 1 - Math.pow(1 - t, 3.2),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      syncTouch: false,
    });

    // Lenis's own event is the only place apply() is called. Listening
    // to window scroll as well double-drives it.
    lenis.on("scroll", (e: { scroll: number; velocity: number }) => {
      apply(e.scroll);
      view.velocity = clamp(Math.abs(e.velocity) / 45, 0, 1);
    });

    const raf = (time: number) => {
      lenis?.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    const onResize = () => {
      measure();
      lenis?.resize();
      apply(window.scrollY);
    };
    window.addEventListener("resize", onResize);
    // Late fonts change section offsets and silently desync the morph
    // from the pin.
    document.fonts?.ready.then(onResize).catch(() => {});

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("astera:goto", onGoto);
      document.removeEventListener("astera:ready", onReady);
      lenis?.destroy();
    };
  }, []);

  return null;
}
