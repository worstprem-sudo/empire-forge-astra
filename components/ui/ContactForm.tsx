"use client";

import { INVESTOR_ACCESS } from "@/lib/content";
import MagneticButton from "./MagneticButton";

export default function ContactForm() {
  return (
    <div className="form" role="group" aria-label="Start copy trading">
      <div className="form-row form-row-telegram">
        <div className="form-copy">
          <strong>Start copy trading directly through Telegram.</strong>
          <span>Join the Empire Forge Astra team and get guided through the broker, PAMM and MT5 copy-trading setup.</span>
        </div>
        <MagneticButton
          className="btn btn-lg"
          href={INVESTOR_ACCESS.telegram}
          target="_blank"
          rel="noopener noreferrer"
        >
          Join Telegram to Start Copy Trading
          <span className="dot" aria-hidden="true" />
        </MagneticButton>
      </div>
    </div>
  );
}
