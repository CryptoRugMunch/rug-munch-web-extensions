/**
 * Settings — Account (wallet + Telegram), multi-wallet, scanning prefs.
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

interface SettingsProps {
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);

  // Telegram linking state
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  // Wallet auth state
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [walletError, setWalletError] = useState<string | null>(null);

  // Add wallet state
  const [addWalletInput, setAddWalletInput] = useState("");
  const [addWalletLabel, setAddWalletLabel] = useState("");
  const [showAddWallet, setShowAddWallet] = useState(false);

  const isLoggedIn = !!(account?.authToken || account?.telegramId);

  useEffect(() => {
    getSettings().then(setSettings);
    getAccount().then(setAccount);
  }, []);

  // Load wallets when logged in
  useEffect(() => {
    if (isLoggedIn) {
      listWallets().then(setWallets);
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

    // 1. Get challenge
    const challenge = await getChallenge();
    if (!challenge) {
      setWalletError("Couldn't connect to API");
      setWalletLoading(false);
      return;
    }

    // 2. For now: simplified auth (no signing, just address verification)
    // Full signing flow needs window.solana which isn't accessible from popup
    // TODO: Content script relay for wallet signing
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
      // Refresh wallets
      listWallets().then(setWallets);
    } else {
      setWalletError(result.error || "Authentication failed");
    }

    setWalletLoading(false);
  }, [walletInput, account]);

  // ─── Telegram Linking ─────────────────────────────────────────
  const openBotLink = useCallback(() => {
    chrome.tabs.create({ url: "https://t.me/rug_munchy_bot?start=link_extension" });
  }, []);

  const verifyCode = useCallback(async () => {
    if (!linkInput || linkInput.length !== 6) return;
    setLinkLoading(true);
    setLinkError(null);

    try {
      const apiBase = settings.apiBase;
      const resp = await fetch(`${apiBase}/ext/link/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: linkInput, extension_id: chrome.runtime.id }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setLinkError(err.detail || `Error: ${resp.status}`);
        return;
      }

      const data = await resp.json();
      const updated = await updateAccount({
        tier: data.tier || "free_linked",
        telegramId: data.telegram_id,
        telegramUsername: data.telegram_username || null,
        linkedAt: new Date().toISOString(),
        authToken: data.auth_token || account?.authToken || null,
      });
      setAccount(updated);
      chrome.storage.local.set({
        tier: data.tier || "free_linked",
        linked_telegram: data.telegram_id,
        auth_token: data.auth_token || account?.authToken || null,
      });
      setLinkInput("");
      setLinkSuccess(true);
      setTimeout(() => setLinkSuccess(false), 5000);
    } catch (e: any) {
      setLinkError(e.message || "Connection failed");
    } finally {
      setLinkLoading(false);
    }
  }, [linkInput, settings, account]);

  // ─── Add Wallet ───────────────────────────────────────────────
  const handleAddWallet = useCallback(async () => {
    const addr = addWalletInput.trim();
    if (!addr || addr.length < 32) return;

    const result = await addWallet(addr, "solana", addWalletLabel || undefined);
    if (result.success) {
      setAddWalletInput("");
      setAddWalletLabel("");
      setShowAddWallet(false);
      listWallets().then(setWallets);
    } else {
      setWalletError(result.error || "Failed to add wallet");
    }
  }, [addWalletInput, addWalletLabel]);

  const handleRemoveWallet = useCallback(async (id: number) => {
    const result = await removeWallet(id);
    if (result.success) {
      listWallets().then(setWallets);
    }
  }, []);

  // ─── Logout ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
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
              <div style={{ display: "flex", gap: 6 }}>
                <input type="text" placeholder="6-digit code" value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6} style={{
                    flex: 1, padding: "6px 8px", borderRadius: 6,
                    backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
                    color: COLORS.textPrimary, fontSize: 14, fontFamily: "monospace",
                    letterSpacing: "3px", textAlign: "center", outline: "none",
                  }} />
                <button onClick={verifyCode} disabled={linkInput.length !== 6}
                  style={{
                    padding: "6px 10px", borderRadius: 6,
                    backgroundColor: linkInput.length === 6 ? COLORS.purple : COLORS.border,
                    color: "#fff", border: "none", fontSize: 11, fontWeight: 600,
                    cursor: linkInput.length === 6 ? "pointer" : "default",
                  }}>Link</button>
              </div>
              <button onClick={openBotLink} style={{
                marginTop: 4, background: "none", border: "none",
                color: COLORS.cyan, fontSize: 10, cursor: "pointer",
              }}>Get code from @rug_munchy_bot →</button>
            </div>
          )}
        </Section>
      ) : (
        <Section title="Sign In">
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            <TabButton label="🔑 Wallet" active />
            <TabButton label="📱 Telegram" />
          </div>

          {/* Wallet Auth */}
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

          {/* Telegram Alt */}
          <div style={{ padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard }}>
            <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
              Or link your Telegram for alerts + synced scan history.
            </p>
            <div style={{
              padding: 8, borderRadius: 6, marginBottom: 6,
              backgroundColor: `${COLORS.purple}10`, fontSize: 11, color: COLORS.textSecondary,
            }}>
              <strong style={{ color: COLORS.textPrimary }}>Step 1:</strong> Get code from bot
              <button onClick={openBotLink} style={{
                display: "block", width: "100%", marginTop: 4,
                padding: "5px 0", borderRadius: 6,
                backgroundColor: COLORS.purple, border: "none",
                color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>🤖 Open @rug_munchy_bot</button>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 }}>
              <strong style={{ color: COLORS.textPrimary }}>Step 2:</strong> Paste code
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="text" placeholder="000000" value={linkInput}
                onChange={(e) => { setLinkInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setLinkError(null); }}
                maxLength={6} style={{
                  flex: 1, padding: "7px", borderRadius: 6,
                  backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  color: COLORS.textPrimary, fontSize: 16, fontFamily: "monospace",
                  letterSpacing: "4px", textAlign: "center", outline: "none",
                }} />
              <button onClick={verifyCode} disabled={linkInput.length !== 6 || linkLoading}
                style={{
                  padding: "7px 12px", borderRadius: 6,
                  backgroundColor: linkInput.length === 6 ? COLORS.cyan : COLORS.border,
                  color: linkInput.length === 6 ? COLORS.bg : COLORS.textMuted,
                  border: "none", fontSize: 11, fontWeight: 600,
                  cursor: linkInput.length === 6 ? "pointer" : "default",
                }}>{linkLoading ? "..." : "Verify"}</button>
            </div>
            {linkError && <div style={{ marginTop: 4, color: COLORS.red, fontSize: 11 }}>❌ {linkError}</div>}
            {linkSuccess && <div style={{ marginTop: 4, color: COLORS.green, fontSize: 11 }}>✅ Linked!</div>}
          </div>

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
