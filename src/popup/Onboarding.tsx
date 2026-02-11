/**
 * Onboarding — First-time user experience.
 */

import React, { useState } from "react";
import { COLORS } from "../utils/designTokens";

interface OnboardingProps {
  onComplete: () => void;
}

const STEPS = [
  {
    emoji: "🗿",
    title: "Welcome to Rug Munch Intelligence",
    description: "Real-time rug pull detection for Solana. We scan tokens so you don't get rugged.",
    detail: "Works on DexScreener, Pump.fun, Jupiter, GMGN, BullX, Birdeye, Raydium, and Photon.",
  },
  {
    emoji: "🔴",
    title: "Risk Scores 0-100",
    description: "Every token gets a risk score. Higher = more dangerous.",
    detail: "🟢 0-24 Low • 🟡 25-49 Moderate • 🟠 50-74 High • 🔴 75-100 Critical\n\nRisk badges appear automatically on supported pages.",
  },
  {
    emoji: "⚡",
    title: "Swap Warnings & Alerts",
    description: "We warn you BEFORE you swap into a rug on Jupiter or Raydium.",
    detail: "Link your Telegram to get smart alerts when your portfolio tokens change risk level.",
  },
  {
    emoji: "🔗",
    title: "Unlock More Scans",
    description: "Works instantly without an account — 10 free scans/hr.",
    detail: "Free: 10/hr → Linked: 30/hr → $CRM Holder: 100/hr → VIP: Unlimited\n\nLink Telegram in Settings for synced history and alerts.",
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      width: 380, minHeight: 480,
      backgroundColor: COLORS.bg, color: COLORS.textPrimary,
      fontFamily: "system-ui", padding: 20,
      display: "flex", flexDirection: "column",
    }}>
      {/* Progress dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 30 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: i === step ? COLORS.purple : i < step ? COLORS.cyan : COLORS.border,
            transition: "all 0.3s",
          }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{current.emoji}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: COLORS.gold }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5, marginBottom: 12 }}>
          {current.description}
        </p>
        <p style={{
          fontSize: 11, color: COLORS.textMuted,
          padding: "10px 14px", borderRadius: 8,
          backgroundColor: COLORS.bgCard, lineHeight: 1.5,
          whiteSpace: "pre-line",
        }}>
          {current.detail}
        </p>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8,
              border: `1px solid ${COLORS.border}`, backgroundColor: "transparent",
              color: COLORS.textSecondary, fontSize: 13, cursor: "pointer",
            }}
          >
            Back
          </button>
        )}
        <button
          onClick={() => isLast ? onComplete() : setStep(step + 1)}
          style={{
            flex: 2, padding: "10px 0", borderRadius: 8,
            border: "none", backgroundColor: isLast ? COLORS.green : COLORS.purple,
            color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {isLast ? "Start Scanning 🚀" : "Next →"}
        </button>
      </div>

      {/* Skip */}
      {!isLast && (
        <button
          onClick={onComplete}
          style={{
            marginTop: 10, background: "none", border: "none",
            color: COLORS.textMuted, fontSize: 11, cursor: "pointer",
          }}
        >
          Skip intro
        </button>
      )}
    </div>
  );
};

export default Onboarding;
