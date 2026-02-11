/**
 * Upgrade — Full tier system with SOL/USDC payment + CRM hold tiers.
 *
 * Subscription tiers: Scout, Analyst, Syndicate (pay SOL/USDC)
 * Hold tiers: Holder (100K CRM), Whale (1M CRM), OG (50M CRM)
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { COLORS } from "../utils/designTokens";
import { getApiBase } from "../utils/config";

interface UpgradeProps {
  onBack: () => void;
  currentTier: string;
}

interface TierInfo {
  name: string;
  emoji: string;
  access: "hold" | "subscribe";
  requirement?: string;
  features: string[];
  prices?: { sol: number; usdc: number; stars_equiv: number };
}

interface PricingData {
  payment_wallet: string;
  tier_order: string[];
  tiers: Record<string, TierInfo>;
}

interface PaymentIntent {
  payment_id: string;
  amount: number;
  currency: string;
  payment_wallet: string;
}

const POLL_INTERVAL = 4000;

const Upgrade: React.FC<UpgradeProps> = ({ onBack, currentTier }) => {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"sol" | "usdc">("sol");
  const [step, setStep] = useState<"select" | "pay" | "success">("select");
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifiedTier, setVerifiedTier] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    fetchPricing();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchPricing = async () => {
    try {
      const base = await getApiBase();
      const resp = await fetch(`${base}/ext/payments/pricing`);
      if (resp.ok) setPricing(await resp.json());
    } catch {}
  };

  const copyAddress = useCallback((addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const createIntent = useCallback(async () => {
    if (!selectedTier) return;
    setError(null);
    try {
      const base = await getApiBase();
      const token = (await chrome.storage.local.get("auth_token")).auth_token;
      if (!token) { setError("Sign in first"); return; }

      const resp = await fetch(`${base}/ext/payments/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ tier: selectedTier, currency, months: 1 }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setError(err.detail || "Failed to create payment");
        return;
      }

      const data: PaymentIntent = await resp.json();
      setIntent(data);
      setStep("pay");
      startPolling(data.payment_id);
    } catch (e: any) {
      setError(e.message || "Connection failed");
    }
  }, [selectedTier, currency]);

  const startPolling = useCallback((paymentId: string) => {
    startRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    pollRef.current = setInterval(async () => {
      if (Date.now() - startRef.current > 3600_000) {
        clearAll();
        setError("Payment window expired.");
        return;
      }
      try {
        const base = await getApiBase();
        const token = (await chrome.storage.local.get("auth_token")).auth_token;
        const resp = await fetch(`${base}/ext/payments/check/${paymentId}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.status === "verified") {
          clearAll();
          chrome.storage.local.set({ tier: data.tier });
          setVerifiedTier(data.tier);
          setTxSig(data.tx_signature || null);
          setStep("success");
        } else if (data.status === "expired" || data.status === "failed") {
          clearAll();
          setError("Payment expired or failed.");
        }
      } catch {}
    }, POLL_INTERVAL);
  }, []);

  const clearAll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  };

  const cancelPayment = useCallback(() => {
    clearAll();
    setStep("select");
    setIntent(null);
    setError(null);
    setElapsed(0);
  }, []);

  if (!pricing) {
    return <Container onBack={onBack}><div style={{ textAlign: "center", padding: 40, color: COLORS.textMuted }}>Loading...</div></Container>;
  }

  // ─── Success ──────────────────────────────────────────────────
  if (step === "success") {
    const info = pricing.tiers[verifiedTier || ""];
    return (
      <Container onBack={onBack}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
          <h2 style={{ color: COLORS.gold, marginBottom: 6, fontSize: 18 }}>Upgrade Complete!</h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>
            You're now <strong style={{ color: COLORS.gold }}>{info?.emoji} {info?.name || verifiedTier}</strong>
          </p>
          {txSig && (
            <div style={{ fontSize: 8, fontFamily: "monospace", color: COLORS.textMuted, marginTop: 8, wordBreak: "break-all", padding: "4px 8px", borderRadius: 4, backgroundColor: COLORS.bgCard }}>
              {txSig}
            </div>
          )}
          <button onClick={onBack} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, backgroundColor: COLORS.purple, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
        </div>
      </Container>
    );
  }

  // ─── Payment ──────────────────────────────────────────────────
  if (step === "pay" && intent) {
    const info = pricing.tiers[selectedTier || ""];
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    return (
      <Container onBack={cancelPayment}>
        <h3 style={{ color: COLORS.gold, marginBottom: 10, fontSize: 14 }}>Send Payment</h3>
        <div style={{ padding: 12, borderRadius: 10, backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted }}>Amount</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{intent.amount} {intent.currency.toUpperCase()}</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted }}>{info?.emoji} {info?.name} — 1 month</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>Send to:</div>
          <div onClick={() => copyAddress(intent.payment_wallet)} style={{ fontSize: 10, fontFamily: "monospace", color: COLORS.cyan, wordBreak: "break-all", cursor: "pointer", padding: "6px 8px", borderRadius: 4, backgroundColor: `${COLORS.cyan}08`, border: `1px solid ${COLORS.cyan}15` }}>
            {intent.payment_wallet}
            <div style={{ fontSize: 9, color: copied ? COLORS.green : COLORS.textMuted, marginTop: 3 }}>{copied ? "✓ Copied!" : "📋 Tap to copy"}</div>
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, backgroundColor: `${COLORS.purple}08`, border: `1px solid ${COLORS.purple}15`, textAlign: "center", marginBottom: 8 }}>
          <PulsingDot />
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Watching for payment...</div>
          <div style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 2 }}>Send exact amount. Auto-detected on-chain.</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: COLORS.textMuted, marginTop: 4 }}>⏱ {min}:{sec.toString().padStart(2, "0")}</div>
        </div>
        <button onClick={cancelPayment} style={{ width: "100%", padding: "8px 0", borderRadius: 8, backgroundColor: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary, fontSize: 11, cursor: "pointer" }}>Cancel</button>
        {error && <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11, textAlign: "center" }}>❌ {error}</div>}
      </Container>
    );
  }

  // ─── Tier Selection ───────────────────────────────────────────
  const tierOrder = ["holder", "scout", "whale", "analyst", "syndicate", "og"];
  const currentRank = tierOrder.indexOf(currentTier);

  return (
    <Container onBack={onBack}>
      <h3 style={{ color: COLORS.gold, marginBottom: 4, fontSize: 14 }}>Upgrade Your Tier</h3>
      <p style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 10 }}>
        Pay with SOL/USDC or hold $CRM tokens. Same features as Telegram.
      </p>

      <div style={{ padding: 6, borderRadius: 6, marginBottom: 10, backgroundColor: `${COLORS.purple}10`, fontSize: 10, color: COLORS.textSecondary, textAlign: "center" }}>
        Current: <strong style={{ color: COLORS.purpleLight }}>{pricing.tiers[currentTier]?.emoji || ""} {currentTier.toUpperCase()}</strong>
      </div>

      <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 8 }}>
        {tierOrder.map((key) => {
          const t = pricing.tiers[key];
          if (!t) return null;
          const isHold = t.access === "hold";
          const isCurrent = currentTier === key;
          const isSelected = selectedTier === key;
          const isUpgrade = tierOrder.indexOf(key) > currentRank;

          return (
            <div key={key} onClick={() => !isHold && !isCurrent && setSelectedTier(key)}
              style={{
                padding: 10, borderRadius: 8, marginBottom: 6, backgroundColor: COLORS.bgCard,
                border: `2px solid ${isCurrent ? COLORS.green : isSelected ? COLORS.purple : COLORS.border}`,
                cursor: isHold || isCurrent ? "default" : "pointer",
                opacity: !isUpgrade && !isCurrent ? 0.5 : 1,
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t.emoji} {t.name}</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {isCurrent && <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 4, backgroundColor: `${COLORS.green}20`, color: COLORS.green }}>CURRENT</span>}
                  {isHold && <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 4, backgroundColor: `${COLORS.gold}15`, color: COLORS.gold }}>HOLD</span>}
                  {!isHold && <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 4, backgroundColor: `${COLORS.cyan}15`, color: COLORS.cyan }}>SUB</span>}
                </div>
              </div>
              <div style={{ fontSize: 9, color: COLORS.textMuted, lineHeight: 1.5 }}>
                {t.features.slice(0, 3).map((f, i) => <span key={i}>✓ {f}{i < 2 ? " · " : ""}</span>)}
                {t.features.length > 3 && <span> +{t.features.length - 3} more</span>}
              </div>
              {isHold && t.requirement && (
                <div style={{ fontSize: 9, color: COLORS.gold, marginTop: 3 }}>💎 {t.requirement}</div>
              )}
              {t.prices && (
                <div style={{ fontSize: 10, color: COLORS.cyan, marginTop: 3 }}>
                  {t.prices.sol} SOL / {t.prices.usdc} USDC per month
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Currency + Pay (only for subscription tiers) */}
      {selectedTier && pricing.tiers[selectedTier]?.access === "subscribe" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <CurrencyBtn label="◎ SOL" active={currency === "sol"} onClick={() => setCurrency("sol")} />
            <CurrencyBtn label="$ USDC" active={currency === "usdc"} onClick={() => setCurrency("usdc")} />
          </div>
          <button onClick={createIntent} style={{
            width: "100%", padding: "10px 0", borderRadius: 8,
            backgroundColor: COLORS.purple, color: "#fff", border: "none",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Pay {currency === "sol"
              ? pricing.tiers[selectedTier]?.prices?.sol + " SOL"
              : pricing.tiers[selectedTier]?.prices?.usdc + " USDC"
            } / month
          </button>
        </>
      )}

      {error && <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11 }}>❌ {error}</div>}
    </Container>
  );
};

// ─── Sub-components ─────────────────────────────────────────────

const Container: React.FC<{ onBack: () => void; children: React.ReactNode }> = ({ onBack, children }) => (
  <div style={{ width: 380, minHeight: 480, maxHeight: 600, overflowY: "auto", backgroundColor: COLORS.bg, color: COLORS.textPrimary, fontFamily: "system-ui", padding: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: COLORS.textSecondary, cursor: "pointer", fontSize: 16, padding: 4 }}>←</button>
      <span style={{ fontWeight: 700, fontSize: 16 }}>🗿 Upgrade</span>
    </div>
    {children}
  </div>
);

const CurrencyBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 600,
    backgroundColor: active ? `${COLORS.cyan}20` : "transparent",
    border: `1px solid ${active ? COLORS.cyan : COLORS.border}`,
    color: active ? COLORS.cyan : COLORS.textMuted, cursor: "pointer",
  }}>{label}</button>
);

const PulsingDot: React.FC = () => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setFrame((f) => (f + 1) % 3), 600);
    return () => clearInterval(i);
  }, []);
  return (
    <div style={{ display: "inline-flex", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple, opacity: i === frame ? 1 : 0.25, transition: "opacity 0.3s" }} />
      ))}
    </div>
  );
};

export default Upgrade;
