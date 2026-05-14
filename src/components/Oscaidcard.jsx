import React, { useState } from "react";
import valLogo from "../assets/vallogo.png";
import ncscLogo from "../assets/ncsclogo.png";
import "./Oscaidcard.css";

/**
 * OSCAIdCard
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
  const isDigital = mode === "digital";

  return (
    <div className="osca-id-wrapper">
      {/* Flip container — click anywhere to flip */}
      <div
        className={`osca-flip-container${flipped ? " flipped" : ""}`}
        onClick={() => setFlipped((f) => !f)}
        title={flipped ? "Click to see front" : "Click to see back (benefits)"}
      >
        {/* ───────────── FRONT ───────────── */}
        <div className="osca-card osca-card-front">
          {/* Header */}
          <div className="front-header">
            <div className="front-header-logo">
              <img src={valLogo} alt="Valenzuela City Government Seal" />
            </div>
            <div className="front-header-center">
              <p className="header-republic">Republic of the Philippines</p>
              <p className="header-city">CITY OF VALENZUELA</p>
              <p className="header-osca">Office of the Senior Citizens Affairs (OSCA)</p>
              {isDigital && <span className="digital-badge">DIGITAL ID</span>}
            </div>
            <div className="front-header-logo">
              <img src={ncscLogo} alt="NCSC Logo" />
            </div>
          </div>

          {/* Body */}
          <div className="front-body">
            <div className="front-fields">
              <div className="field-row">
                <span className="field-label">Name:</span>
                <span className="field-value">{name}</span>
              </div>
              <div className="field-row">
                <span className="field-label">Address:</span>
                <span className="field-value address-value">
                  {address.split("\n").map((line, i, arr) => (
                    <React.Fragment key={i}>
                      {line}
                      {i < arr.length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </span>
              </div>

              <div className="front-meta">
                <div className="meta-block">
                  <div className="meta-val">{dateOfBirth}</div>
                  <div className="meta-lbl">Date of Birth</div>
                </div>
                <div className="meta-block">
                  <div className="meta-val">{sex}</div>
                  <div className="meta-lbl">Sex</div>
                </div>
                <div className="meta-block">
                  <div className="meta-val">{dateIssued}</div>
                  <div className="meta-lbl">Date Issued</div>
                </div>
              </div>
            </div>

            {/* Photo */}
            <div className="front-photo">
              <div className="photo-box">
                {photoUrl ? (
                  <img src={photoUrl} alt="Member photo" className="photo-img" />
                ) : (
                  <svg width="46" height="56" viewBox="0 0 50 60" aria-hidden="true">
                    <circle cx="25" cy="20" r="14" fill="#bbb" />
                    <ellipse cx="25" cy="54" rx="20" ry="12" fill="#bbb" />
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Bottom */}
          <div className="front-bottom">
            <div className="sig-area">
              <div className="sig-line" />
              <div className="sig-label">Signature / Thumbmark</div>
            </div>
            <div className="control-area">
              <div className="control-no">{controlNo}</div>
              <div className="control-label">Control No.</div>
            </div>
          </div>

          <div className="front-footer">
            <span>This card is non-transferable</span>
          </div>
        </div>

        {/* ───────────── BACK ───────────── */}
        <div className="osca-card osca-card-back">
          <div className="back-top-stripe" />

          <div className="back-title-bar">
            <h2 className="back-title">Benefits and Privileges under R.A. 9994</h2>
          </div>

          <div className="back-body">
            <ol className="benefits-list">
              <li>Free medical / dental, diagnostic &amp; laboratory services in all government facilities</li>
              <li>20% discount for medicines</li>
              <li>20% discount in hotels, restaurants &amp; recreation centers</li>
              <li>20% discount in theaters, cinema houses &amp; concert halls</li>
              <li>20% discount in medical / dental services, diagnostic &amp; laboratory fees in private facilities</li>
              <li>20% discount in fare for domestic air, sea travel &amp; public land transportations</li>
              <li>5% discount in basic necessities &amp; primary commodities</li>
              <li>
                12% VAT-exemption on the purchase of goods &amp; services which are entitled to the 20% discount
              </li>
              <li>
                5% discount for the monthly utilization of water &amp; electricity, provided that the water &amp;
                electricity meter bases are under the name of the senior citizens.
              </li>
            </ol>

            <div className="back-notice">
              <p>Persons and corporations violating R.A. 9994 shall be penalized.</p>
              <p>Only for the exclusive use of senior citizens; abuse of privileges is punishable by law.</p>
            </div>

            <div className="back-signers">
              <div className="signer">
                <div className="signer-sig-space" />
                <div className="signer-line" />
                <div className="signer-name">Dorothy G. Evangelista</div>
                <div className="signer-title">OSCA Head</div>
              </div>
              <div className="signer">
                <div className="signer-sig-space" />
                <div className="signer-line" />
                <div className="signer-name">WES Gatchalian</div>
                <div className="signer-title">City Mayor</div>
              </div>
            </div>
          </div>

          <div className="back-footer">
            <div className="back-footer-left">
              <div className="progreso-text">
                <span className="progreso-tuloy">Tuloy-PROGRESO,</span>
                <br />
                <span className="progreso-city">Valenzuela!</span>
              </div>
            </div>
            <div className="back-footer-right">
              <div className="footer-web">www.valenzuela.gov.ph</div>
              <div className="footer-socials">
                ✉ info@valenzuela.gov.ph &nbsp; f Valenzuela City &nbsp; @ valenzuelacity
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hint text below the card */}
      <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "6px", userSelect: "none" }}>
        {flipped ? "↩ Click to see front" : "↪ Click card to see benefits (back)"}
      </p>
    </div>
  );
};

export default OSCAIdCard;