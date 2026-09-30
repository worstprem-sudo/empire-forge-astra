"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { SECTIONS } from "@/lib/content";
import ScrollEngine from "./ScrollEngine";
import SectionBlock from "./SectionBlock";
import ChapterRail from "./ui/ChapterRail";
import Cursor from "./ui/Cursor";
import Footer from "./ui/Footer";
import Nav from "./ui/Nav";
import Preloader from "./ui/Preloader";
import ScrollHint from "./ui/ScrollHint";

// ssr: false is mandatory — the canvas touches window on import.
const Scene = dynamic(() => import("./field/Scene"), { ssr: false });

export default function Experience() {
  const [showScene, setShowScene] = useState(false);

  // Deferred one tick past the preloader: building ~150k particles
  // across six shapes is a few hundred milliseconds of synchronous
  // work, and without this it blocks the preloader's first paint.
  useEffect(() => {
    const id = window.setTimeout(() => setShowScene(true), 80);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <a className="skip-link" href="#stage">
        Skip to content
      </a>

      <Preloader />
      <Cursor />

      <div className="fixed inset-0 z-0" aria-hidden="true">
        {showScene && <Scene />}
      </div>

      <Nav />
      <ChapterRail />
      <ScrollHint />

      <main id="top" className="relative z-10">
        <div id="stage">
          {SECTIONS.map((section, i) => (
            <SectionBlock key={section.id} section={section} index={i} />
          ))}
        </div>

        <Footer />
      </main>

      <ScrollEngine />
    </>
  );
}
