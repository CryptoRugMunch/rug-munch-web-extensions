/**
 * Extension configuration — stored in chrome.storage.local.
 * Configurable via settings page.
 */

export interface ExtensionSettings {
  autoScan: boolean;          // Auto-scan tokens on supported pages
  showBadges: boolean;        // Show risk badges on pages
  swapWarnings: boolean;      // Show pre-swap warnings on Jupiter/Raydium
  compactBadges: boolean;     // Use compact badge style in lists
  apiBase: string;            // API base URL
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  autoScan: true,
  showBadges: true,
  swapWarnings: true,
  compactBadges: false,
  apiBase: "https://cryptorugmunch.ngrok.app/api",
};

export async function getSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get("settings");
    return { ...DEFAULT_SETTINGS, ...result.settings };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(updates: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const merged = { ...current, ...updates };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

export async function getApiBase(): Promise<string> {
  const settings = await getSettings();
  return settings.apiBase;
}

// Account state
export interface AccountState {
  tier: "free" | "free_linked" | "holder" | "vip";
  telegramId: number | null;
  telegramUsername: string | null;
  linkedAt: string | null;
  authToken: string | null;
}

export const DEFAULT_ACCOUNT: AccountState = {
  tier: "free",
  telegramId: null,
  telegramUsername: null,
  linkedAt: null,
  authToken: null,
};

export async function getAccount(): Promise<AccountState> {
  try {
    const result = await chrome.storage.local.get("account");
    return { ...DEFAULT_ACCOUNT, ...result.account };
  } catch {
    return DEFAULT_ACCOUNT;
  }
}

export async function updateAccount(updates: Partial<AccountState>): Promise<AccountState> {
  const current = await getAccount();
  const merged = { ...current, ...updates };
  await chrome.storage.local.set({ account: merged });
  return merged;
}
