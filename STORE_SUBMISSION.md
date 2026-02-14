# Store Submission Checklist

## Packages Ready
- [x] Chrome: `rug-munch-intelligence-chrome-1.0.0.zip` (150KB)
- [x] Firefox: `rug-munch-intelligence-firefox-1.0.0.zip` (400KB)
- [x] Safari: `npm run build:safari` → Xcode projects in `safari-xcode/`

## Chrome Web Store
1. [ ] Create developer account at https://chrome.google.com/webstore/devconsole ($5 one-time)
2. [ ] Upload `rug-munch-intelligence-chrome-1.0.0.zip`
3. [ ] Fill in listing:
   - **Name:** Rug Munch Intelligence
   - **Short description:** Crypto rug pull scanner — instant risk scores on DexScreener, Pump.fun, Jupiter, and more
   - **Category:** Productivity (or Finance if available)
   - **Language:** English
4. [ ] Upload screenshots (1280x800 or 640x400)
5. [ ] Privacy policy URL: `https://cryptorugmunch.com/privacy`
6. [ ] Permissions justification:
   - `activeTab`: Detect token addresses on current page
   - `storage`: Save user preferences and auth state
   - `alarms`: Background tier sync
   - Host permissions: DexScreener, Pump.fun, etc. for risk badge injection

## Firefox AMO
1. [ ] Create account at https://addons.mozilla.org/developers/ (free)
2. [ ] Submit `rug-munch-intelligence-firefox-1.0.0.zip`
3. [ ] Same listing info as Chrome

## Apple App Store
1. [ ] Create Distribution certificate: Xcode → Settings → Accounts → Manage Certificates → + → Apple Distribution
2. [ ] Register app at https://appstoreconnect.apple.com
   - Bundle ID: `com.cryptorugmunch.Rug-Munch-Intelligence`
   - SKU: `rug-munch-intelligence`
3. [ ] Run `npm run archive:safari` → uploads to App Store Connect
4. [ ] Fill in listing (see `appstore/metadata.md`)
5. [ ] Submit for review

## Privacy Policy
- [ ] Host at `https://cryptorugmunch.com/privacy` (content in `appstore/privacy-policy.md`)

## Screenshots Needed
- [ ] Chrome popup showing risk badge (1280x800)
- [ ] DexScreener with injected risk badge
- [ ] Marcus chat conversation
- [ ] Side panel with scan result
