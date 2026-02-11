/**
 * Settings — Extension configuration + account linking.
 */

import React, { useState, useEffect, useCallback } from "react";
import { COLORS } from "../utils/designTokens";
import {
  getSettings, updateSettings, type ExtensionSettings,
  getAccount, updateAccount, type AccountState, DEFAULT_SETTINGS,
} from "../utils/config";

interface SettingsProps {
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
    getAccount().then(setAccount);
  }, []);

  const toggleSetting = useCallback(async (key: keyof ExtensionSettings) => {
    const updated = await updateSettings({ [key]: !settings[key] });
    setSettings(updated);
  }, [settings]);

  const openBotLink = useCallback(() => {
    chrome.tabs.create({
      url: "https://t.me/rug_munchy_bot?start=link_extension",
    });
  }, []);

  const verifyCode = useCallback(async () => {
    if (!linkInput || linkInput.length !== 6) return;
    setLinkLoading(true);
    setLinkError(null);
    setLinkSuccess(false);

    try {
      const apiBase = settings.apiBase;
      const resp = await fetch(`${apiBase}/ext/link/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: linkInput,
          extension_id: chrome.runtime.id,
        }),
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
        authToken: data.auth_token || null,
      });
      setAccount(updated);

      // Also store tier and auth in chrome.storage for other components
      chrome.storage.local.set({
        tier: data.tier || "free_linked",
        linked_telegram: data.telegram_id,
        auth_token: data.auth_token || null,
      });

      setLinkInput("");
      setLinkSuccess(true);
      setTimeout(() => setLinkSuccess(false), 5000);
    } catch (e: any) {
      setLinkError(e.message || "Connection failed — is the API running?");
    } finally {
      setLinkLoading(false);
    }
  }, [linkInput, settings]);

  const unlinkAccount = useCallback(async () => {
    const updated = await updateAccount({
      tier: "free",
      telegramId: null,
      telegramUsername: null,
      linkedAt: null,
      authToken: null,
    });
    setAccount(updated);
    chrome.storage.local.set({ tier: "free", linked_telegram: null, auth_token: null });
  }, []);

  return (
    <div style={{
      width: 380, minHeight: 480,
      backgroundColor: COLORS.bg, color: COLORS.textPrimary,
      fontFamily: "system-ui", padding: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            background: "none", border: "none", color: COLORS.textSecondary,
            cursor: "pointer", fontSize: 16, padding: 4,
          }}
        >
          ←
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Settings</span>
      </div>

      {/* Account Section */}
      <Section title="Account">
        {account?.telegramId ? (
          <div style={{
            padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard,
            border: `1px solid ${COLORS.green}30`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>
                  ✓ Telegram Linked
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                  {account.telegramUsername ? `@${account.telegramUsername}` : `ID: ${account.telegramId}`}
                </div>
              </div>
              <TierBadge tier={account.tier} />
            </div>
            <button
              onClick={unlinkAccount}
              style={{
                marginTop: 8, background: "none", border: "none",
                color: COLORS.textMuted, fontSize: 10, cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Unlink account
            </button>
          </div>
        ) : (
          <div style={{ padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard }}>
            <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 }}>
              Link your Telegram to unlock more scans and sync your tier.
            </p>

            {/* Step 1: Get code from bot */}
            <div style={{
              padding: 8, borderRadius: 6, marginBottom: 8,
              backgroundColor: `${COLORS.purple}10`, border: `1px solid ${COLORS.purple}20`,
              fontSize: 11, color: COLORS.textSecondary,
            }}>
              <strong style={{ color: COLORS.textPrimary }}>Step 1:</strong> Open the bot to get your link code
              <button
                onClick={openBotLink}
                style={{
                  display: "block", width: "100%", marginTop: 6,
                  padding: "6px 0", borderRadius: 6,
                  backgroundColor: COLORS.purple, border: "none",
                  color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                🤖 Open @rug_munchy_bot
              </button>
            </div>

            {/* Step 2: Enter code */}
            <div style={{
              padding: 8, borderRadius: 6,
              backgroundColor: `${COLORS.cyan}08`, border: `1px solid ${COLORS.cyan}15`,
              fontSize: 11, color: COLORS.textSecondary,
            }}>
              <strong style={{ color: COLORS.textPrimary }}>Step 2:</strong> Paste the 6-digit code here
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  type="text"
                  placeholder="000000"
                  value={linkInput}
                  onChange={(e) => {
                    setLinkInput(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setLinkError(null);
                  }}
                  maxLength={6}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 6,
                    backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
                    color: COLORS.textPrimary, fontSize: 18, fontFamily: "monospace",
                    letterSpacing: "4px", textAlign: "center", outline: "none",
                  }}
                />
                <button
                  onClick={verifyCode}
                  disabled={linkInput.length !== 6 || linkLoading}
                  style={{
                    padding: "8px 14px", borderRadius: 6,
                    backgroundColor: linkInput.length === 6 ? COLORS.cyan : COLORS.border,
                    color: linkInput.length === 6 ? COLORS.bg : COLORS.textMuted,
                    border: "none", fontSize: 12,
                    fontWeight: 600, cursor: linkInput.length === 6 ? "pointer" : "default",
                  }}
                >
                  {linkLoading ? "..." : "Verify"}
                </button>
              </div>
            </div>

            {/* Error/success feedback */}
            {linkError && (
              <div style={{
                marginTop: 6, padding: "6px 8px", borderRadius: 4,
                backgroundColor: `${COLORS.red}15`, color: COLORS.red,
                fontSize: 11,
              }}>
                ❌ {linkError}
              </div>
            )}
            {linkSuccess && (
              <div style={{
                marginTop: 6, padding: "6px 8px", borderRadius: 4,
                backgroundColor: `${COLORS.green}15`, color: COLORS.green,
                fontSize: 11,
              }}>
                ✅ Successfully linked! Your scans are now synced.
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Registration hint for non-TG users */}
      <Section title="No Telegram?">
        <div style={{
          padding: 10, borderRadius: 8, backgroundColor: COLORS.bgCard,
          fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5,
        }}>
          You can use Rug Munch Intelligence without Telegram — scanning works instantly with the free tier (10 scans/hr).
          For more scans and portfolio alerts, create a free Telegram account and link it above.
        </div>
      </Section>

      {/* Scanning Preferences */}
      <Section title="Scanning">
        <Toggle
          label="Auto-scan on supported pages"
          description="Automatically detect and scan tokens on DexScreener, Pump.fun, GMGN, BullX, Birdeye, Raydium, Jupiter, Photon"
          checked={settings.autoScan}
          onChange={() => toggleSetting("autoScan")}
        />
        <Toggle
          label="Show risk badges"
          description="Inject risk score badges on token pages"
          checked={settings.showBadges}
          onChange={() => toggleSetting("showBadges")}
        />
        <Toggle
          label="Swap warnings"
          description="Warn before swapping into high-risk tokens"
          checked={settings.swapWarnings}
          onChange={() => toggleSetting("swapWarnings")}
        />
      </Section>

      {/* Version */}
      <div style={{
        textAlign: "center", fontSize: 10, color: COLORS.textMuted,
        marginTop: 20, paddingTop: 10, borderTop: `1px solid ${COLORS.border}`,
      }}>
        Rug Munch Intelligence v{chrome.runtime.getManifest().version} • 🗿
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{
      fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
      textTransform: "uppercase", letterSpacing: "1px",
      marginBottom: 8, paddingLeft: 2,
    }}>
      {title}
    </div>
    {children}
  </div>
);

const Toggle: React.FC<{
  label: string; description: string; checked: boolean; onChange: () => void;
}> = ({ label, description, checked, onChange }) => (
  <div
    onClick={onChange}
    style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 12px", borderRadius: 8, backgroundColor: COLORS.bgCard,
      marginBottom: 6, cursor: "pointer",
    }}
  >
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{description}</div>
    </div>
    <div style={{
      width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginLeft: 8,
      backgroundColor: checked ? COLORS.purple : COLORS.border,
      position: "relative", transition: "all 0.2s",
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: "#fff", position: "absolute",
        top: 2, left: checked ? 18 : 2,
        transition: "left 0.2s",
      }} />
    </div>
  </div>
);

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  const tierConfig: Record<string, { label: string; color: string }> = {
    free: { label: "Free", color: COLORS.textMuted },
    free_linked: { label: "Linked", color: COLORS.cyan },
    holder: { label: "$CRM Holder", color: COLORS.gold },
    vip: { label: "VIP", color: COLORS.purple },
  };
  const { label, color } = tierConfig[tier] || tierConfig.free;
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 10,
      backgroundColor: `${color}20`, color, fontWeight: 600,
    }}>
      {label}
    </span>
  );
};

export default Settings;
