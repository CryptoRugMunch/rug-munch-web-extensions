/**
 * Onboarding — First-time user experience.
 * 
 * Shows on first install. Explains:
 * 1. What the extension does
 * 2. How risk badges work
 * 3. Link Telegram for more scans
 * 4. Get started
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
    description: "Real-time rug pull detection for Solana tokens. We scan tokens so you don't get rugged.",
    detail: "Risk badges appear automatically on DexScreener, Pump.fun, and Jupiter.",
  },
  {
    emoji: "🔴",
    title: "Risk Badges",
    description: "Every token gets a risk score from 0-100. Higher = more dangerous.",
    detail: "🟢 Low (0-24) • 🟡 Moderate (25-49) • 🟠 High (50-74) • 🔴 Critical (75-100)",
  },
  {
    emoji: "⚡",
    title: "Swap Warnings",
    description: "When you're about to swap into a risky token on Jupiter, we'll warn you first.",
    detail: "No more accidental rug pulls. We've got your back.",
  },
  {
    emoji: "🔗",
    title: "Link Telegram",
    description: "Connect with @rug_munchy_bot for 3x more scans and synced scan history.",
    detail: "Free: 10/hr → Linked: 30/hr → $CRM Holder: 100/hr → VIP: Unlimited",
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
            backgroundColor: i === step ? COLORS.purple : COLORS.border,
            transition: "all 0.3s",
          }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{current.emoji}</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: COLORS.gold }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.5, marginBottom: 12 }}>
          {current.description}
        </p>
        <p style={{
          fontSize: 12, color: COLORS.textMuted,
          padding: "8px 12px", borderRadius: 8,
          backgroundColor: COLORS.bgCard, lineHeight: 1.4,
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
            border: "none", backgroundColor: COLORS.purple,
            color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {isLast ? "Get Started 🚀" : "Next"}
        </button>
      </div>

      {/* Skip */}
      {!isLast && (
        <button
          onClick={onComplete}
          style={{
            marginTop: 8, background: "none", border: "none",
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
