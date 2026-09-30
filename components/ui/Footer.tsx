"use client";

import { useEffect, useState } from "react";

import { BRAND, TAGLINE } from "@/lib/content";
import { goto } from "@/lib/nav";
import Mark from "./Mark";

const COLUMNS = [
  { title: "Copy Trading", links: ["How It Works", "Performance", "MT5 Access", "Fees"] },
  { title: "Broker", links: ["Ultima Markets", "Open Live Account", "PAMM", "MetaTrader 5"] },
  { title: "Community", links: ["Telegram", "Contact", "Risk Disclosure", "Support"] },
];

/** Studio clock. Rendered only after mount so it cannot mismatch SSR. */
function LocalTime() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setTime(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }).format(new Date())
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="mono-label num">
      India {time ?? "--:--:--"}
    </span>
  );
}

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-col">
          <span className="brand" style={{ padding: 0 }}>
            <Mark className="brand-mark" />
            {BRAND}
          </span>
          <p className="lede" style={{ fontSize: "13px", maxWidth: "30ch" }}>
            {TAGLINE}.
          </p>
          <span className="availability" style={{ marginTop: "0.4rem" }}>
            <i aria-hidden="true" />
            Pure XAUUSD copy trading
          </span>
        </div>

        {COLUMNS.map((col) => (
          <div className="footer-col" key={col.title}>
            <span className="mono-label">{col.title}</span>
            {col.links.map((link) => (
              <a key={link} href="#top" onClick={(e) => e.preventDefault()}>
                {link}
              </a>
            ))}
          </div>
        ))}
      </div>

      <div className="footer-bottom">
        <span className="mono-label">
          © {new Date().getFullYear()} {BRAND} — All rights reserved
        </span>
        <LocalTime />
        <button
          type="button"
          className="mono-label"
          style={{ background: "none", border: 0, letterSpacing: "0.24em" }}
          onClick={() => goto(0)}
        >
          Back to top ↑
        </button>
      </div>
    </footer>
  );
}
