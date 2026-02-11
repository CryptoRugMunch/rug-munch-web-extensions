# Rug Munch Scanner — Browser Extension

Chrome + Firefox extension for real-time rug pull detection on DexScreener, Pump.fun, Jupiter, and more.

## Features
- 🔴 Risk badges injected on DexScreener & Pump.fun token pages
- 🔍 Popup quick scan — paste any CA for instant analysis
- 💬 Side panel Marcus chat (Chrome 116+)
- 🔗 Account linking with Telegram bot
- 🏷️ Tiered access: Free → Holder → VIP

## Stack
- Manifest V3 (Chrome), WebExtensions (Firefox)
- React + TypeScript + Vite
- Shadow DOM isolation for content scripts
- IndexedDB for client-side caching

## Development
```bash
npm install
npm run dev      # Development with HMR
npm run build    # Production build
```

## Architecture
See `docs/` for detailed architecture documentation.

