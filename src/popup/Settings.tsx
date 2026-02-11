/**
 * Settings — Account (wallet + Telegram), multi-wallet, scanning prefs.
 *
 * Telegram link uses auto-verify flow:
 * 1. Extension calls /link/init → gets link_token
 * 2. Opens https://t.me/rug_munchy_bot?start=link_{token}
 * 3. User taps Start in Telegram → bot auto-verifies
 * 4. Extension polls /link/status/{token} → gets auth creds
 * Zero manual code paste.
 */

import React, { useState, useEffect, useCallback } from "react";
import { COLORS } from "../utils/designTokens";
import {
  getSettings, updateSettings, type ExtensionSettings,
  getAccount, updateAccount, type AccountState, DEFAULT_SETTINGS,
} from "../utils/config";
import {
  getChallenge, verifyWalletSignature,
  listWallets, addWallet, removeWallet,
  type WalletInfo,
} from "../services/walletAuth";
import { useAutoLink } from "../hooks/useAutoLink";

interface SettingsProps {
  onBack: () => void;
}


const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);

  // Telegram auto-link (shared hook)
  const autoLink = useAutoLink();

  // Wallet auth state
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [walletError, setWalletError] = useState<string | null>(null);

  // Add wallet state
  const [addWalletInput, setAddWalletInput] = useState("");
  const [addWalletLabel, setAddWalletLabel] = useState("");
  const [showAddWallet, setShowAddWallet] = useState(false);

  // Auth tab
  const [authTab, setAuthTab] = useState<"wallet" | "telegram">("wallet");

  const isLoggedIn = !!(account?.authToken || account?.telegramId);

  useEffect(() => {
    getSettings().then(setSettings);
    getAccount().then(setAccount);
  }, []);

  // Load wallets when logged in
  useEffect(() => {
    if (isLoggedIn) {
      listWallets().then(setWallets).catch(() => {});
    }
  }, [isLoggedIn]);

  const toggleSetting = useCallback(async (key: keyof ExtensionSettings) => {
    const updated = await updateSettings({ [key]: !settings[key] });
    setSettings(updated);
  }, [settings]);

  // ─── Wallet Sign-In ───────────────────────────────────────────
  const handleWalletAuth = useCallback(async () => {
    const addr = walletInput.trim();
    if (!addr || addr.length < 32) {
      setWalletError("Enter a valid Solana wallet address");
      return;
    }

    setWalletLoading(true);
    setWalletError(null);

    const challenge = await getChallenge();
    if (!challenge) {
      setWalletError("Couldn't connect to API");
      setWalletLoading(false);
      return;
    }

    const result = await verifyWalletSignature(addr, "extension-auth", challenge.nonce);

    if (result.success) {
      const updated = await updateAccount({
        tier: result.tier as any || "free",
        authToken: result.authToken || null,
        telegramId: account?.telegramId || null,
        telegramUsername: account?.telegramUsername || null,
        linkedAt: new Date().toISOString(),
      });
      setAccount(updated);
      chrome.storage.local.set({
        tier: result.tier, auth_token: result.authToken,
      });
      setWalletInput("");
      listWallets().then(setWallets).catch(() => {});
    } else {
      setWalletError(result.error || "Authentication failed");
    }

    setWalletLoading(false);
  }, [walletInput, account]);


  // ─── Add Wallet ───────────────────────────────────────────────
  const handleAddWallet = useCallback(async () => {
    const addr = addWalletInput.trim();
    if (!addr || addr.length < 32) return;

    const result = await addWallet(addr, "solana", addWalletLabel || undefined);
    if (result.success) {
      setAddWalletInput("");
      setAddWalletLabel("");
      setShowAddWallet(false);
      listWallets().then(setWallets).catch(() => {});
    } else {
      setWalletError(result.error || "Failed to add wallet");
    }
  }, [addWalletInput, addWalletLabel]);

  const handleRemoveWallet = useCallback(async (id: number) => {
    const result = await removeWallet(id);
    if (result.success) {
      listWallets().then(setWallets).catch(() => {});
    }
  }, []);

  // ─── Logout ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    autoLink.cancel();
    await updateAccount({
      tier: "free", telegramId: null, telegramUsername: null,
      linkedAt: null, authToken: null,
    });
    setAccount(null);
    setWallets([]);
    chrome.storage.local.set({ tier: "free", linked_telegram: null, auth_token: null });
  }, []);

  return (
    <div style={{
      width: 380, minHeight: 480, maxHeight: 600, overflowY: "auto",
      backgroundColor: COLORS.bg, color: COLORS.textPrimary,
      fontFamily: "system-ui", padding: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: COLORS.textSecondary,
          cursor: "pointer", fontSize: 16, padding: 4,
        }}>←</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Settings</span>
      </div>

      {/* ─── Account Section ─── */}
      {isLoggedIn ? (
        <Section title="Account">
          <div style={{
            padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard,
            border: `1px solid ${COLORS.green}30`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>
                  ✓ Signed In
                </div>
                {account?.telegramId && (
                  <div style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 2 }}>
                    Telegram: {account.telegramUsername ? `@${account.telegramUsername}` : `ID: ${account.telegramId}`}
                  </div>
                )}
              </div>
              <TierBadge tier={account?.tier || "free"} />
            </div>
            <button onClick={logout} style={{
              marginTop: 8, background: "none", border: "none",
              color: COLORS.textMuted, fontSize: 10, cursor: "pointer",
              textDecoration: "underline",
            }}>Sign out</button>
          </div>

          {/* Telegram link (if wallet-only user) */}
          {!account?.telegramId && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: COLORS.bgCard }}>
              <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 6 }}>
                💡 Link Telegram for alerts and synced history
              </div>
              <TelegramLinkButton
                phase={autoLink.phase}
                error={autoLink.error}
                onStart={autoLink.start}
                onCancel={autoLink.cancel}
              />
            </div>
          )}
        </Section>
      ) : (
        <Section title="Sign In">
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            <TabButton label="🔑 Wallet" active={authTab === "wallet"} onClick={() => setAuthTab("wallet")} />
            <TabButton label="📱 Telegram" active={authTab === "telegram"} onClick={() => setAuthTab("telegram")} />
          </div>

          {authTab === "wallet" ? (
            /* Wallet Auth */
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard, marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
                Sign in with your Solana wallet address. No Telegram needed.
              </p>
              <input type="text" placeholder="Your Solana wallet address..."
                value={walletInput}
                onChange={(e) => { setWalletInput(e.target.value); setWalletError(null); }}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6,
                  backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  color: COLORS.textPrimary, fontSize: 11, fontFamily: "monospace",
                  outline: "none", marginBottom: 6, boxSizing: "border-box",
                }} />
              <button onClick={handleWalletAuth} disabled={walletLoading || walletInput.length < 32}
                style={{
                  width: "100%", padding: "8px 0", borderRadius: 6,
                  backgroundColor: walletInput.length >= 32 ? COLORS.purple : COLORS.border,
                  color: "#fff", border: "none", fontSize: 12, fontWeight: 600,
                  cursor: walletInput.length >= 32 ? "pointer" : "default",
                }}>
                {walletLoading ? "Connecting..." : "Sign In with Wallet"}
              </button>
              {walletError && (
                <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11 }}>❌ {walletError}</div>
              )}
              <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted }}>
                💡 $CRM holders get 100 scans/hr automatically detected
              </div>
            </div>
          ) : (
            /* Telegram Auto-Link */
            <div style={{ padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard, marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 }}>
                Link your Telegram account for alerts, synced history, and higher scan limits.
              </p>
              <TelegramLinkButton
                phase={autoLink.phase}
                error={autoLink.error}
                onStart={autoLink.start}
                onCancel={autoLink.cancel}
              />
              <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted }}>
                Opens @rug_munchy_bot in Telegram. Just tap <b>Start</b> — we'll detect it automatically.
              </div>
            </div>
          )}

          {/* No-account note */}
          <div style={{
            marginTop: 8, padding: 8, borderRadius: 6,
            fontSize: 10, color: COLORS.textMuted, textAlign: "center",
          }}>
            Scanning works without an account (10 free scans/hr).
            Sign in for more scans, alerts, and multi-wallet tracking.
          </div>
        </Section>
      )}

      {/* ─── Wallets Section ─── */}
      {isLoggedIn && (
        <Section title={`Wallets (${wallets.length}/10)`}>
          {wallets.map((w) => (
            <div key={w.id} style={{
              padding: 10, borderRadius: 8, backgroundColor: COLORS.bgCard,
              marginBottom: 4, display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  {w.label || "Wallet"}
                  {w.isPrimary && <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 4,
                    backgroundColor: `${COLORS.gold}20`, color: COLORS.gold,
                  }}>PRIMARY</span>}
                </div>
                <div style={{
                  fontSize: 9, fontFamily: "monospace", color: COLORS.textMuted,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  cursor: "pointer",
                }} onClick={() => navigator.clipboard.writeText(w.address)}
                  title="Click to copy full address">
                  {w.address}
                </div>
              </div>
              <button onClick={() => handleRemoveWallet(w.id)} style={{
                background: "none", border: "none", color: COLORS.textMuted,
                cursor: "pointer", fontSize: 12, padding: 4,
              }} title="Remove wallet">✕</button>
            </div>
          ))}

          {/* Add wallet */}
          {showAddWallet ? (
            <div style={{ padding: 10, borderRadius: 8, backgroundColor: COLORS.bgCard }}>
              <input type="text" placeholder="Solana wallet address"
                value={addWalletInput}
                onChange={(e) => setAddWalletInput(e.target.value)}
                style={{
                  width: "100%", padding: "6px 8px", borderRadius: 6, marginBottom: 4,
                  backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  color: COLORS.textPrimary, fontSize: 10, fontFamily: "monospace",
                  outline: "none", boxSizing: "border-box",
                }} />
              <input type="text" placeholder="Label (e.g. Degen, Trading, Cold)"
                value={addWalletLabel}
                onChange={(e) => setAddWalletLabel(e.target.value)}
                style={{
                  width: "100%", padding: "6px 8px", borderRadius: 6, marginBottom: 6,
                  backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  color: COLORS.textPrimary, fontSize: 11, outline: "none",
                  boxSizing: "border-box",
                }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleAddWallet}
                  disabled={addWalletInput.length < 32}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 6,
                    backgroundColor: addWalletInput.length >= 32 ? COLORS.green : COLORS.border,
                    color: "#fff", border: "none", fontSize: 11, fontWeight: 600,
                    cursor: addWalletInput.length >= 32 ? "pointer" : "default",
                  }}>Add Wallet</button>
                <button onClick={() => setShowAddWallet(false)} style={{
                  padding: "6px 10px", borderRadius: 6,
                  backgroundColor: "transparent", border: `1px solid ${COLORS.border}`,
                  color: COLORS.textSecondary, fontSize: 11, cursor: "pointer",
                }}>Cancel</button>
              </div>
            </div>
          ) : wallets.length < 10 ? (
            <button onClick={() => setShowAddWallet(true)} style={{
              width: "100%", padding: "8px 0", borderRadius: 8,
              backgroundColor: "transparent", border: `1px dashed ${COLORS.border}`,
              color: COLORS.textSecondary, fontSize: 11, cursor: "pointer",
            }}>+ Add Wallet</button>
          ) : null}
        </Section>
      )}

      {/* ─── Scanning Preferences ─── */}
      <Section title="Scanning">
        <Toggle label="Auto-scan on supported pages"
          description="DexScreener, Pump.fun, GMGN, BullX, Birdeye, Raydium, Jupiter, Photon"
          checked={settings.autoScan} onChange={() => toggleSetting("autoScan")} />
        <Toggle label="Show risk badges"
          description="Inject risk badges on token pages"
          checked={settings.showBadges} onChange={() => toggleSetting("showBadges")} />
        <Toggle label="Swap warnings"
          description="Warn before swapping into high-risk tokens"
          checked={settings.swapWarnings} onChange={() => toggleSetting("swapWarnings")} />
      </Section>

      {/* Version */}
      <div style={{
        textAlign: "center", fontSize: 10, color: COLORS.textMuted,
        marginTop: 12, paddingTop: 8, borderTop: `1px solid ${COLORS.border}`,
      }}>
        Rug Munch Intelligence v{chrome.runtime.getManifest().version} • 🗿
      </div>
    </div>
  );
};

// ─── Telegram Auto-Link Button ──────────────────────────────────

const TelegramLinkButton: React.FC<{
  phase: "idle" | "waiting" | "success" | "error";
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
}> = ({ phase, error, onStart, onCancel }) => {
  if (phase === "success") {
    return (
      <div style={{
        padding: 10, borderRadius: 8, textAlign: "center",
        backgroundColor: `${COLORS.green}15`, border: `1px solid ${COLORS.green}30`,
      }}>
        <div style={{ fontSize: 20, marginBottom: 4 }}>✅</div>
        <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>
          Telegram Linked!
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{
          padding: 12, borderRadius: 8,
          backgroundColor: `${COLORS.purple}10`, border: `1px solid ${COLORS.purple}30`,
        }}>
          <div style={{ marginBottom: 8 }}>
            <PulsingDot />
          </div>
          <div style={{ fontSize: 12, color: COLORS.textPrimary, fontWeight: 600, marginBottom: 2 }}>
            Waiting for Telegram...
          </div>
          <div style={{ fontSize: 10, color: COLORS.textSecondary }}>
            Tap <b>Start</b> in the Telegram chat that just opened
          </div>
        </div>
        <button onClick={onCancel} style={{
          marginTop: 6, background: "none", border: "none",
          color: COLORS.textMuted, fontSize: 10, cursor: "pointer",
          textDecoration: "underline",
        }}>Cancel</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onStart} style={{
        width: "100%", padding: "10px 0", borderRadius: 8,
        backgroundColor: COLORS.cyan, color: COLORS.bg,
        border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        📱 Link Telegram Account
      </button>
      {phase === "error" && error && (
        <div style={{ marginTop: 6, color: COLORS.red, fontSize: 11, textAlign: "center" }}>
          ❌ {error}
          <button onClick={onStart} style={{
            marginLeft: 6, background: "none", border: "none",
            color: COLORS.cyan, fontSize: 11, cursor: "pointer",
            textDecoration: "underline",
          }}>Retry</button>
        </div>
      )}
    </div>
  );
};

// ─── Pulsing Dot Animation ──────────────────────────────────────

const PulsingDot: React.FC = () => {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity((prev) => (prev === 1 ? 0.3 : 1));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: COLORS.purple,
          opacity: opacity,
          transition: "opacity 0.6s ease",
          transitionDelay: `${i * 200}ms`,
        }} />
      ))}
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{
      fontSize: 10, fontWeight: 700, color: COLORS.textMuted,
      textTransform: "uppercase", letterSpacing: "1px",
      marginBottom: 6, paddingLeft: 2,
    }}>{title}</div>
    {children}
  </div>
);

const Toggle: React.FC<{
  label: string; description: string; checked: boolean; onChange: () => void;
}> = ({ label, description, checked, onChange }) => (
  <div onClick={onChange} style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 10px", borderRadius: 8, backgroundColor: COLORS.bgCard,
    marginBottom: 4, cursor: "pointer",
  }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 1 }}>{description}</div>
    </div>
    <div style={{
      width: 34, height: 18, borderRadius: 9, flexShrink: 0, marginLeft: 8,
      backgroundColor: checked ? COLORS.purple : COLORS.border,
      position: "relative", transition: "all 0.2s",
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: "#fff", position: "absolute",
        top: 2, left: checked ? 18 : 2, transition: "left 0.2s",
      }} />
    </div>
  </div>
);

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  const cfg: Record<string, { label: string; color: string }> = {
    free: { label: "Free", color: COLORS.textMuted },
    free_linked: { label: "Linked", color: COLORS.cyan },
    holder: { label: "$CRM Holder", color: COLORS.gold },
    vip: { label: "VIP", color: COLORS.purple },
  };
  const { label, color } = cfg[tier] || cfg.free;
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 10,
      backgroundColor: `${color}20`, color, fontWeight: 600,
    }}>{label}</span>
  );
};

const TabButton: React.FC<{ label: string; active?: boolean; onClick?: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
    backgroundColor: active ? `${COLORS.purple}20` : "transparent",
    border: `1px solid ${active ? COLORS.purple : COLORS.border}`,
    color: active ? COLORS.purpleLight : COLORS.textMuted,
    cursor: "pointer",
  }}>{label}</button>
);

export default Settings;
