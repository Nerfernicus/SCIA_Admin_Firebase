import React, { useLayoutEffect, useRef, useState } from "react";
import { IdFace } from "./IdTemplateFace";
import { CARD_W, CARD_H, useIdTemplate } from "../lib/idTemplate";
import "./Oscaidcard.css";

/**
 * OSCAIdCard
 * Draws both sides of the ID from the saved template (settings/idTemplate), or from the
 * built-in default design when none is saved / the load fails.
 * Props:
 *   mode        : "digital" | "physical"
 *   name        : string
 *   address     : string
 *   dateOfBirth : string  (MM-DD-YY)
 *   sex         : string
 *   dateIssued  : string  (MM-DD-YYYY)
 *   controlNo   : string
 *   photoUrl    : string  (URL or base64)
 */
const OSCAIdCard = ({
  mode = "digital",
  name = "",
  address = "",
  dateOfBirth = "",
  sex = "",
  dateIssued = "",
  controlNo = "",
  photoUrl = null,
}) => {
  const [flipped, setFlipped] = useState(false);
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  const template = useIdTemplate();

  // Fit the 540px-wide card to the space it is given (page, modal, phone...).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const fit = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.max(0.3, Math.min(1, w / CARD_W)));
    };
    fit();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = {
    name, address, dateOfBirth, sex, dateIssued, controlNo, photoUrl,
    qrValue: controlNo, barcodeValue: controlNo,
  };

  return (
    <div className="osca-id-wrapper" ref={wrapRef}>
      {/* The card is designed at 540x340. This box takes the SCALED size so it
          fits whatever width the page/modal gives it (no fixed phone breakpoints). */}
      <div className="osca-scale-box" style={{ width: CARD_W * scale, height: CARD_H * scale }}>
        <div
          className={`osca-flip-container${flipped ? " flipped" : ""}`}
          style={{ "--osca-scale": scale }}
          onClick={() => setFlipped((f) => !f)}
          title={flipped ? "Click to see front" : "Click to see back (benefits)"}
        >
          <div className="osca-card osca-card-front">
            <IdFace template={template} side="front" data={data} mode={mode} />
          </div>
          <div className="osca-card osca-card-back">
            <IdFace template={template} side="back" data={data} mode={mode} />
          </div>
        </div>
      </div>

      <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "6px", userSelect: "none" }}>
        {flipped ? "↩ Click to see front" : "↪ Click card to see benefits (back)"}
      </p>
    </div>
  );
};

export default OSCAIdCard;