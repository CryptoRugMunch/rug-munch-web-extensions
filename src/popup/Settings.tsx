/**
 * Settings — Extension configuration + account linking.
 * 
 * Panels:
 * - Account: Link/unlink Telegram, view tier
 * - Scanning: Auto-scan, badges, swap warnings toggles
 * - Advanced: API URL, cache clear
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

  useEffect(() => {
    getSettings().then(setSettings);
    getAccount().then(setAccount);
  }, []);

  const toggleSetting = useCallback(async (key: keyof ExtensionSettings) => {
    const updated = await updateSettings({ [key]: !settings[key] });
    setSettings(updated);
  }, [settings]);

  const startLink = useCallback(async () => {
    setLinkLoading(true);
    try {
      // User needs to get a code from the Telegram bot first
      // Open bot with deep link
      chrome.tabs.create({
        url: "https://t.me/rug_munchy_bot?start=link_extension",
      });
    } catch (e) {
      console.error("Link start failed:", e);
    }
    setLinkLoading(false);
  }, []);

  const verifyCode = useCallback(async () => {
    if (!linkInput || linkInput.length !== 6) return;
    setLinkLoading(true);
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

      if (resp.ok) {
        const data = await resp.json();
        const updated = await updateAccount({
          tier: data.tier || "free_linked",
          telegramId: data.telegram_id,
          linkedAt: new Date().toISOString(),
        });
        setAccount(updated);
        
        setLinkInput("");
      }
    } catch (e) {
      console.error("Link verify failed:", e);
    }
    setLinkLoading(false);
  }, [linkInput, settings]);

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
                  {account.telegramUsername || `ID: ${account.telegramId}`}
                </div>
              </div>
              <TierBadge tier={account.tier} />
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, borderRadius: 8, backgroundColor: COLORS.bgCard }}>
            <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 }}>
              Link your Telegram to unlock more scans and sync your tier.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                placeholder="6-digit code from bot"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 6,
                  backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  color: COLORS.textPrimary, fontSize: 13, fontFamily: "monospace",
                  letterSpacing: "2px", textAlign: "center", outline: "none",
                }}
              />
              <button
                onClick={verifyCode}
                disabled={linkInput.length !== 6 || linkLoading}
                style={{
                  padding: "6px 12px", borderRadius: 6,
                  backgroundColor: linkInput.length === 6 ? COLORS.purple : COLORS.border,
                  color: "#fff", border: "none", fontSize: 12,
                  fontWeight: 600, cursor: linkInput.length === 6 ? "pointer" : "default",
                }}
              >
                Link
              </button>
            </div>
            <button
              onClick={startLink}
              style={{
                width: "100%", marginTop: 8, padding: "6px 0",
                background: "none", border: "none",
                color: COLORS.cyan, fontSize: 11, cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Get code from @rug_munchy_bot →
            </button>
          </div>
        )}
      </Section>

      {/* Scanning Preferences */}
      <Section title="Scanning">
        <Toggle
          label="Auto-scan on supported pages"
          description="Automatically scan tokens on DexScreener, Pump.fun, etc."
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
          description="Warn before swapping into high-risk tokens on Jupiter"
          checked={settings.swapWarnings}
          onChange={() => toggleSetting("swapWarnings")}
        />
      </Section>

      {/* Version */}
      <div style={{
        textAlign: "center", fontSize: 10, color: COLORS.textMuted,
        marginTop: 20, paddingTop: 10, borderTop: `1px solid ${COLORS.border}`,
      }}>
        Rug Munch Scanner v{chrome.runtime.getManifest().version} • 🗿
      </div>
    </div>
  );
};

// Sub-components
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
    <div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{description}</div>
    </div>
    <div style={{
      width: 36, height: 20, borderRadius: 10,
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
    holder: { label: "$CRM", color: COLORS.gold },
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
