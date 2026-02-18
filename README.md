# Rug Munch Intelligence — Browser Extension

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue?logo=googlechrome)](https://chromewebstore.google.com)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-orange?logo=firefox)](https://addons.mozilla.org)
[![Safari](https://img.shields.io/badge/Safari-App%20Store-lightblue?logo=safari)](https://apps.apple.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Real-time rug pull detection for crypto traders.** Risk scores injected directly on DexScreener, Pump.fun, Jupiter, and 5 more platforms — before you ape.

<p align="center">
  <img src="public/crm-icon-128.png" alt="Rug Munch Intelligence" width="128" />
</p>

## How It Works

1. **Browse normally** — visit any supported crypto site
2. **See risk badges** — tokens are automatically scanned and badged (🟢 Safe / 🟡 Caution / 🔴 Avoid)
3. **Click for details** — full breakdown: holder concentration, LP lock, deployer history, contract flags
4. **Ask Marcus** — AI-powered analysis via the side panel chat

No copy-pasting contract addresses. No switching tabs. Risk intelligence where you need it — on the page.

## Supported Platforms

| Platform | Features |
|----------|----------|
| [DexScreener](https://dexscreener.com) | Risk badges on token pages + token lists |
| [Pump.fun](https://pump.fun) | Risk badges on new token pages |
| [Jupiter](https://jup.ag) | Pre-swap warnings before you trade |
| [Raydium](https://raydium.io) | Pre-swap warnings before you trade |
| [Birdeye](https://birdeye.so) | Risk badges on token pages |
| [BullX](https://bullx.io) | Risk badges on token pages |
| [GMGN.ai](https://gmgn.ai) | Risk badges on token pages |
| [Photon](https://photon-sol.tinyastro.io) | Risk badges on token pages |

## Features

### 🔴 Auto Risk Badges
Tokens are scanned automatically as you browse. Color-coded badges appear next to token names — no action required.

### 🔍 Quick Scan Popup
Click the extension icon → paste any contract address → instant risk score with full breakdown.

### 💬 Marcus AI Chat (Side Panel)
Open the side panel for a conversational AI analyst. Ask Marcus about any token and get forensic-level analysis powered by Claude.

### ⚡ Pre-Swap Warnings
On Jupiter and Raydium, get a risk check popup *before* you confirm a swap. Catches honeypots and rug pulls at the last possible moment.

### 🔗 Telegram Account Linking
Link your Telegram account to sync your tier, reputation, and scan history between the bot and extension.

### 🏆 Tiered Access
| Tier | Scans | Features |
|------|-------|----------|
| Free | 3/day | Risk badges, quick scan |
| Linked | 10/day | + Marcus chat |
| Holder | Unlimited | + Pre-swap warnings, priority scans |

## Tech Stack

- **Manifest V3** (Chrome) / **WebExtensions** (Firefox) / **Safari Web Extension**
- **React 18** + **TypeScript** + **Vite** (via CRXJS)
- **Tailwind CSS** for styling
- **Shadow DOM** isolation for content scripts (no CSS conflicts with host pages)
- **IndexedDB** for client-side scan caching

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Background                  │
│  Service worker: auth, API calls, alarms     │
├─────────────────────────────────────────────┤
│         Content Scripts (per-site)           │
│  dexscreener.tsx  pumpfun.tsx  jupiter.tsx   │
│  raydium.tsx  birdeye.tsx  bullx.tsx         │
│  gmgn.tsx  photon.tsx  universal.ts          │
│  Shadow DOM mounted badges + overlays        │
├─────────────────────────────────────────────┤
│  Popup          │  Side Panel               │
│  Quick scan,    │  Marcus AI chat,          │
│  settings,      │  full analysis            │
│  account link   │                           │
├─────────────────────────────────────────────┤
│              Rug Munch API                   │
│  cryptorugmunch.app/api                     │
│  Risk scores, holder data, AI forensics      │
└─────────────────────────────────────────────┘
```

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/CryptoRugMunch/rug-munch-extension.git
cd rug-munch-extension
npm install
```

### Development (Chrome)

```bash
npm run dev
```

Then load the unpacked extension:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `dist/` folder
4. CRXJS provides HMR — changes reload automatically

### Production Build

```bash
# Chrome
npm run build

# Firefox
npm run build:firefox

# Safari (requires macOS + Xcode)
npm run build:safari
```

### Project Structure

```
src/
├── background/       # Service worker (auth, API, alarms)
├── content/          # Per-site content scripts
│   ├── dexscreener.tsx
│   ├── pumpfun.tsx
│   ├── jupiter.tsx
│   ├── raydium.tsx
│   ├── birdeye.tsx
│   ├── bullx.tsx
│   ├── gmgn.tsx
│   ├── photon.tsx
│   └── universal.ts  # Cross-site token detection
├── popup/            # Extension popup UI
│   ├── Popup.tsx     # Quick scan
│   ├── Settings.tsx  # Configuration
│   ├── MarcusChat.tsx
│   └── ...
├── sidepanel/        # Chrome side panel (Marcus chat)
├── components/       # Shared React components
├── services/         # API client, wallet auth
├── hooks/            # React hooks
├── utils/            # Config, token extraction, helpers
├── styles/           # Tailwind + global styles
└── types/            # TypeScript type definitions
```

## Permissions Explained

| Permission | Why |
|-----------|-----|
| `storage` | Save settings, auth state, and cached scans locally |
| `activeTab` | Detect token addresses on the page you're viewing |
| `sidePanel` | Marcus AI chat panel |
| `contextMenus` | Right-click → "Scan this token" |
| `alarms` | Background tier sync (every few hours) |
| `scripting` | Inject risk badges on supported sites |
| Host permissions | Only the 8 supported crypto sites + our own API |

**We do NOT request:** `tabs`, `history`, `bookmarks`, `cookies`, `webRequest`, or any broad host permissions. The extension only activates on the specific crypto sites listed above.

## Privacy

- **No tracking.** No analytics. No fingerprinting.
- **No data sold.** Ever.
- **Only token addresses** are sent to our API — publicly available blockchain data, not personal information.
- **No wallet private keys** are ever accessed or transmitted.
- Full privacy policy: [appstore/privacy-policy.md](appstore/privacy-policy.md)

## API

The extension calls the Rug Munch Intelligence API at `cryptorugmunch.app/api`. The same API that powers:

- [MCP Server](https://github.com/CryptoRugMunch/rug-munch-mcp) — 19 tools for Claude Desktop, Cursor, Windsurf
- [x402 Trading Agent](https://github.com/CryptoRugMunch/x402-trading-agent) — Example Python agent
- [AgentKit Plugin](https://github.com/CryptoRugMunch/rug-agent-kit) — Coinbase AgentKit integration

## Contributing

Contributions welcome! Especially:

- **New platform support** — add a content script for a new crypto site
- **Bug fixes** — especially cross-browser compatibility
- **UI improvements** — badges, popups, side panel

Please open an issue first for larger changes.

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  Built by traders, for traders. Don't ape blind. 🦍🔍
</p>
