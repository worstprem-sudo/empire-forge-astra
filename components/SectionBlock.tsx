"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

import { CLIENTS, HERO_FACTS, INVESTOR_ACCESS, type SectionContent } from "@/lib/content";
import { goto } from "@/lib/nav";
import { view } from "@/lib/state";
import ContactForm from "./ui/ContactForm";
import MagneticButton from "./ui/MagneticButton";
import MethodRail from "./ui/MethodRail";
import Metrics from "./ui/Metrics";

interface Props {
  section: SectionContent;
  index: number;
}

/**
 * Titles are split to the *word*, not the line. A per-word blur-in
 * survives line wrapping; a per-line clip mask breaks the moment the
 * viewport narrows and a line reflows into two.
 */
function Title({ lines, as }: { lines: string[]; as: "h1" | "h2" }) {
  const Tag = as;
  return (
    <Tag className="display">
      {lines.map((line, li) => (
        <span className="title-line" key={li}>
          {line.split(" ").map((word, wi, arr) => (
            <span className="word" key={wi}>
              {word}
              {wi < arr.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}

/**
 * The type block. Everything the reader actually has to read lives
 * inside this one element, which carries the scrim that lifts it off
 * the particle field behind it.
 */
function TypeBlock({
  section,
  index,
  align = "center",
}: {
  section: SectionContent;
  index: number;
  align?: "center" | "start";
}) {
  return (
    <div
      className="typewell"
      style={{
        display: "grid",
        gap: "clamp(0.85rem, 1.6vw, 1.35rem)",
        justifyItems: align === "center" ? "center" : "start",
        textAlign: align === "center" ? "center" : "left",
      }}
    >
      <span className="eyebrow" data-fade>
        {section.eyebrow}
      </span>
      <Title lines={section.title} as={index === 0 ? "h1" : "h2"} />
      {section.body ? (
        <p className="lede" data-fade>
          {section.body}
        </p>
      ) : null}
      {section.bodyStrong ? (
        <p className="lede" data-fade style={{ fontWeight: 800, color: "var(--fg, #fff)" }}>
          {section.bodyStrong}
        </p>
      ) : null}
    </div>
  );
}

export default function SectionBlock({ section, index }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  /* The reveal is driven by the scroll engine's active-section event,
     so it fires exactly as the copy starts to appear. An
     IntersectionObserver fires about a screen early on sections this
     tall, and the animation would be over before it was visible. */
  useEffect(() => {
    const el = panel.current;
    if (!el) return;

    const words = el.querySelectorAll<HTMLElement>(".word");
    const fades = el.querySelectorAll<HTMLElement>("[data-fade]");

    if (view.reduced) {
      gsap.set(words, { opacity: 1, filter: "blur(0px)", y: 0 });
      gsap.set(fades, { opacity: 1, y: 0 });
      return;
    }

    // Both directions kill first, or scrubbing back and forth stacks
    // tweens until the copy stops responding at all.
    const reset = () => {
      gsap.killTweensOf(words);
      gsap.killTweensOf(fades);
      gsap.set(words, { opacity: 0, filter: "blur(12px)", y: 14 });
      gsap.set(fades, { opacity: 0, y: 16 });
    };

    const play = () => {
      gsap.killTweensOf(words);
      gsap.killTweensOf(fades);
      gsap.to(words, {
        opacity: 1,
        filter: "blur(0px)",
        y: 0,
        duration: 1.1,
        ease: "power2.out",
        stagger: 0.046,
      });
      gsap.to(fades, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: "power3.out",
        stagger: 0.07,
        delay: 0.14,
      });
    };

    const onSection = (e: Event) => {
      const active = (e as CustomEvent<number>).detail;
      if (active === index) play();
      else reset();
    };

    reset();
    document.addEventListener("astera:section", onSection);
    return () => {
      gsap.killTweensOf(words);
      gsap.killTweensOf(fades);
      document.removeEventListener("astera:section", onSection);
    };
  }, [index]);

  return (
    <section className="stage-section" id={section.id} aria-label={section.chapter}>
      <div className="stage-pin">
        <div className="shell panel" data-panel ref={panel}>
          {section.layout === "hero" && (
            <div className="hero">
              <TypeBlock section={section} index={index} />

              <div className="hero-actions" data-fade>
                <MagneticButton
                  className="btn btn-lg"
                  href={INVESTOR_ACCESS.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join Telegram to Start Copy Trading
                  <span className="dot" aria-hidden="true" />
                </MagneticButton>
                <MagneticButton
                  className="btn btn-ghost btn-lg"
                  onClick={() => goto(2)}
                >
                  See how it works
                </MagneticButton>
              </div>

              <div className="hero-meta" data-fade>
                {HERO_FACTS.map((fact) => (
                  <div key={fact.label}>
                    <b className="num">{fact.value}</b>
                    <span className="mono-label">{fact.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section.layout === "disciplines" && section.disciplines && (
            <div className="disciplines">
              <div className="disc-col" data-fade>
                {section.disciplines.slice(0, 2).map((d) => (
                  <Discipline key={d.name} d={d} />
                ))}
              </div>

              <div className="center">
                <TypeBlock section={section} index={index} />
              </div>

              <div className="disc-col right" data-fade>
                {section.disciplines.slice(2).map((d) => (
                  <Discipline key={d.name} d={d} />
                ))}
              </div>
            </div>
          )}

          {section.layout === "method" && section.steps && (
            <div className="method">
              <div className="method-head">
                <TypeBlock section={section} index={index} />
              </div>
              <div data-fade>
                <MethodRail steps={section.steps} index={index} />
              </div>
            </div>
          )}

          {section.layout === "evidence" && section.metrics && (
            <div className="evidence">
              <TypeBlock section={section} index={index} align="start" />
              <div data-fade>
                <Metrics metrics={section.metrics} index={index} />
              </div>
            </div>
          )}

          {section.layout === "voices" && section.voices && (
            <div className="voices">
              <TypeBlock section={section} index={index} />

              {section.id === "bloom" ? (
                <div className="voice-grid" data-fade>
                  {section.voices.map((v) => (
                    <article className="voice" key={v.name}>
                      <div className="metric-value" style={{ marginBottom: "0.5rem" }}>
                        {v.quote}
                      </div>
                      <figcaption>
                        <b>{v.name}</b>
                        <span>{v.role}</span>
                      </figcaption>
                    </article>
                  ))}

                  <article className="voice" key="server">
                    <div className="metric-value" style={{ marginBottom: "0.5rem" }}>
                      PRIMEWAVE FX LTD
                    </div>
                    <figcaption>
                      <b>Server</b>
                      <span>Public MT5 investor access</span>
                    </figcaption>
                  </article>

                  <article className="voice" key="broker">
                    <div className="metric-value" style={{ marginBottom: "0.5rem" }}>
                      Ultima Markets
                    </div>
                    <figcaption>
                      <b>Broker</b>
                      <span>MetaTrader 5</span>
                    </figcaption>
                  </article>
                </div>
              ) : (
                <div className="voice-grid" data-fade>
                  {section.voices.map((v) => (
                    <figure className="voice" key={v.name}>
                      <blockquote>“{v.quote}”</blockquote>
                      <figcaption>
                        <b>{v.name}</b>
                        <span>{v.role}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}

              <div className="clients" data-fade>
                {CLIENTS.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {section.layout === "contact" && (
            <div className="contact">
              <TypeBlock section={section} index={index} />
              <div data-fade style={{ width: "min(100%, 40rem)" }}>
                <ContactForm />
              </div>
              <div data-fade style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", justifyContent: "center" }}>
                <a
                  className="btn btn-lg"
                  href={INVESTOR_ACCESS.ibAccountUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Ultima Markets Account
                  <span className="dot" aria-hidden="true" />
                </a>
                <a
                  className="btn btn-ghost btn-lg"
                  href={INVESTOR_ACCESS.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join Telegram
                </a>
              </div>
              <span className="availability" data-fade>
                <i aria-hidden="true" />
                Minimum deposit: $700 · PAMM step: $1,000
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Discipline({
  d,
}: {
  d: { index: string; name: string; claim: string; detail: string };
}) {
  return (
    <button type="button" className="disc" data-interactive>
      <span className="disc-head">
        <span className="disc-index">{d.index}</span>
        <span className="disc-name">{d.name}</span>
      </span>
      <span className="disc-claim">{d.claim}</span>
      <span className="disc-detail">
        <span>{d.detail}</span>
      </span>
    </button>
  );
}
