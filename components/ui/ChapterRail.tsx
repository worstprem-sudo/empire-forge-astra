"use client";

import { useEffect, useState } from "react";

import { SECTIONS } from "@/lib/content";
import { goto } from "@/lib/nav";

/**
 * Chapter rail. Doubles as a progress readout and as navigation — the
 * reference this grew out of had neither, so there was no way to tell
 * how far through a six-beat page you were, or to skip.
 *
 * The fill bar is driven straight from the scroll engine via a DOM
 * write; only the active index comes through React, and only when it
 * actually changes.
 */
export default function ChapterRail() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onSection = (e: Event) => setActive((e as CustomEvent<number>).detail);
    document.addEventListener("astera:section", onSection);
    return () => document.removeEventListener("astera:section", onSection);
  }, []);

  return (
    <div className="rail" data-rail aria-label="Chapters">
      <span className="rail-track" aria-hidden="true">
        <i className="rail-fill" data-rail-fill />
      </span>

      {SECTIONS.map((section, i) => (
        <button
          key={section.id}
          type="button"
          className="rail-item"
          data-active={active === i}
          aria-current={active === i ? "true" : undefined}
          onClick={() => goto(i)}
        >
          <span>{section.index}</span>
          <span>{section.chapter}</span>
        </button>
      ))}
    </div>
  );
}
