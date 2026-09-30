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
    // How far each panel's content overruns the screen. On a phone a
    // panel can be taller than the viewport, and centring it in the
    // pin would cut off the top and bottom.
    let overflow: number[] = [];
    let railFill: HTMLElement | null = null;
    let rail: HTMLElement | null = null;
    let sectionH = 1;
    let stageTop = 0;
    // Resting points the page snaps between, in scroll pixels.
    let stops: number[] = [0];

    const measure = () => {
      stage = document.getElementById("stage");
      panels = Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"));
      rail = document.querySelector<HTMLElement>("[data-rail]");
      railFill = document.querySelector<HTMLElement>("[data-rail-fill]");
      overflow = panels.map((el) => {
        const pin = el.parentElement;
        if (!pin) return 0;
        pin.removeAttribute("data-overflow");
        const cs = getComputedStyle(pin);
        const room =
          pin.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const over = Math.max(0, el.offsetHeight - room);
        if (over > 0) pin.setAttribute("data-overflow", "true");
        return over;
      });
      if (!stage) return;
      stageTop = stage.getBoundingClientRect().top + window.scrollY;
      sectionH = stage.offsetHeight / SECTION_COUNT;
      stops = buildStops();
    };

    /* Every section rests at its start. Sections with more than one
       screen of content get extra stops: one per screenful of panning,
       and one per step on the method rail when it has to slide. So a
       light scroll always lands on something readable. */
    const buildStops = () => {
      const out: number[] = [];
      const vh = window.innerHeight;
      panels.forEach((el, i) => {
        const locals = [i === 0 ? 0 : 0.06];

        const over = overflow[i] ?? 0;
        if (over > 0) {
          const n = Math.ceil(over / (vh * 0.6));
          for (let k = 1; k <= n; k++) locals.push(0.04 + 0.34 * (k / n));
        }

        const vp = el.querySelector<HTMLElement>(".method-rail");
        const tr = el.querySelector<HTMLElement>(".method-track");
        if (vp && tr) {
          const railOver = tr.scrollWidth - vp.clientWidth;
          if (railOver > 1) {
            const cards = tr.children.length;
            const n = Math.min(Math.max(cards - 1, 1), Math.ceil(railOver / (vp.clientWidth * 0.7)));
            // Matches the rail's FROM/TO window in MethodRail.
            for (let k = 1; k <= n; k++) locals.push(0.06 + 0.38 * (k / n));
          }
        }

        locals
          .sort((a, b) => a - b)
          .forEach((l) => {
            const y = stageTop + (i + l) * sectionH;
            if (!out.length || y - out[out.length - 1] > sectionH * 0.03) out.push(y);
          });
      });
      return out;
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
        // Tall panels pan through their content while fully visible,
        // so everything gets its turn on screen before the fade.
        const pan = overflow[i] ? clamp((local - 0.04) / 0.34, 0, 1) * overflow[i] : 0;
        el.style.transform = `translate3d(0, ${((1 - vis) * 24 - pan).toFixed(2)}px, 0)`;
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

    /* ---- Snapping ------------------------------------------------ *
       One light wheel flick, swipe or key press moves exactly one stop.
       Past the last stop (the footer) scrolling is free again. */
    let snapping = false;
    let waitForQuiet = false;
    let lastWheel = 0;
    let touchTravel = 0;
    let touchFired = false;

    const current = () => lenis?.targetScroll ?? window.scrollY;
    const lastStop = () => stops[stops.length - 1] ?? 0;
    const inSnapRange = (dir: number) => {
      const y = current();
      return dir > 0 ? y < lastStop() - 2 : y <= lastStop() + 2;
    };

    const step = (dir: number) => {
      if (snapping || !lenis) return;
      const y = current();
      const to =
        dir > 0
          ? stops.find((s) => s > y + 2)
          : [...stops].reverse().find((s) => s < y - 2);
      if (to === undefined) return;
      snapping = true;
      const crossesSection = Math.floor((to - stageTop) / sectionH) !== Math.floor((y - stageTop) / sectionH);
      lenis.scrollTo(to, {
        duration: crossesSection ? 1.05 : 0.8,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        lock: true,
        onComplete: () => {
          snapping = false;
          // A trackpad keeps firing inertia for a while after the
          // flick; that tail must not count as a second scroll.
          waitForQuiet = true;
        },
      });
    };

    const virtualScroll = ({ deltaY, event }: { deltaY: number; event: Event }) => {
      const dir = Math.sign(deltaY);
      const isWheel = event.type === "wheel";

      if (event.type === "touchstart") {
        touchTravel = 0;
        touchFired = false;
        return true;
      }
      if ((event as WheelEvent).ctrlKey) return true;

      if (isWheel) {
        const now = performance.now();
        const gap = now - lastWheel;
        lastWheel = now;
        if (snapping) return false;
        if (waitForQuiet) {
          if (gap < 160) return false;
          waitForQuiet = false;
        }
        // Only snap on small, discrete wheel movements (trackpad flicks)
        if (Math.abs(deltaY) <= 3 && inSnapRange(dir)) {
          step(dir);
          return false;
        }
        // Let large scrolls through for natural scrolling
        return true;
      }

      if (event.type === "touchmove") {
        touchTravel += deltaY;
        if (!touchFired && Math.abs(touchTravel) > 40) {
          touchFired = true;
          waitForQuiet = false;
          if (inSnapRange(Math.sign(touchTravel))) {
            step(Math.sign(touchTravel));
            if (event.cancelable) event.preventDefault();
          }
          return false;
        }
        // Allow normal scrolling for ongoing touch
        return true;
      }
      return true;
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      let dir = 0;
      if (e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) dir = 1;
      else if (e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) dir = -1;
      if (!dir || !inSnapRange(dir)) return;
      e.preventDefault();
      step(dir);
    };
    window.addEventListener("keydown", onKey);

    lenis = new Lenis({
      virtualScroll,
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
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("astera:goto", onGoto);
      document.removeEventListener("astera:ready", onReady);
      lenis?.destroy();
    };
  }, []);

  return null;
}
