#!/usr/bin/env node
/**
 * Safari extension build script.
 *
 * Takes the Chrome dist and generates Xcode projects for:
 * - macOS Safari (safari-xcode/)
 * - iOS Safari (safari-xcode-ios/)
 *
 * Prerequisites:
 * - Xcode installed with command-line tools
 * - macOS only
 * - Run `npm run build` first to generate dist/
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const distChrome = path.join(__dirname, "..", "dist");
const distSafari = path.join(__dirname, "..", "dist-safari");

// Verify dist exists
if (!fs.existsSync(distChrome)) {
  console.error("❌ dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

// Step 1: Create Safari-compatible dist
console.log("📋 Creating Safari-compatible dist...");
if (fs.existsSync(distSafari)) fs.rmSync(distSafari, { recursive: true });
fs.cpSync(distChrome, distSafari, { recursive: true });

const manifest = JSON.parse(
  fs.readFileSync(path.join(distSafari, "manifest.json"), "utf-8")
);

// Remove unsupported features
delete manifest.side_panel;
delete manifest.minimum_chrome_version;
manifest.permissions = manifest.permissions.filter(
  (p) => !["sidePanel"].includes(p)
);

fs.writeFileSync(
  path.join(distSafari, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log("✅ Safari manifest ready\n");

// Step 2: Generate Xcode projects
const targets = [
  {
    name: "macOS",
    flag: "--macos-only",
    outDir: path.join(__dirname, "..", "safari-xcode"),
    bundleId: "com.cryptorugmunch.safari-extension",
  },
  {
    name: "iOS",
    flag: "--ios-only",
    outDir: path.join(__dirname, "..", "safari-xcode-ios"),
    bundleId: "com.cryptorugmunch.safari-extension-ios",
  },
];

for (const target of targets) {
  console.log(`🔨 Generating ${target.name} Xcode project...`);
  if (fs.existsSync(target.outDir)) fs.rmSync(target.outDir, { recursive: true });

  try {
    execSync(
      [
        "xcrun safari-web-extension-converter",
        `"${distSafari}"`,
        "--project-location", `"${target.outDir}"`,
        "--app-name", '"Rug Munch Intelligence"',
        "--bundle-identifier", target.bundleId,
        "--swift",
        target.flag,
        "--no-open",
        "--no-prompt",
      ].join(" "),
      { stdio: "inherit" }
    );
    console.log(`✅ ${target.name} project → ${path.basename(target.outDir)}/\n`);
  } catch (e) {
    console.error(`❌ ${target.name} conversion failed\n`);
  }
}

console.log("🎯 Next steps:");
console.log("   macOS: open safari-xcode/Rug\\ Munch\\ Intelligence/Rug\\ Munch\\ Intelligence.xcodeproj");
console.log("   iOS:   open safari-xcode-ios/Rug\\ Munch\\ Intelligence/Rug\\ Munch\\ Intelligence.xcodeproj");
console.log("   → Select signing team → Build & Run (⌘R)");
console.log("   → Safari > Settings > Extensions → Enable");
