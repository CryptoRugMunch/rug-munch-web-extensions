#!/usr/bin/env node
/**
 * Safari extension build script.
 *
 * Generates Xcode projects for macOS + iOS Safari, fixes bundle IDs,
 * and builds both via xcodebuild CLI.
 *
 * Prerequisites: Xcode with CLI tools, macOS only.
 * Run `npm run build` first to generate dist/.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const distChrome = path.join(__dirname, "..", "dist");
const distSafari = path.join(__dirname, "..", "dist-safari");

const TEAM_ID = "DGKZ9VVY9B";
const APP_BUNDLE_ID = "com.cryptorugmunch.Rug-Munch-Intelligence";

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
delete manifest.side_panel;
delete manifest.minimum_chrome_version;
manifest.permissions = manifest.permissions.filter((p) => p !== "sidePanel");
fs.writeFileSync(
  path.join(distSafari, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log("✅ Safari manifest ready\n");

// Step 2: Generate and build for each platform
const targets = [
  { name: "macOS", flag: "--macos-only", dir: "safari-xcode", dest: "platform=macOS" },
  { name: "iOS",   flag: "--ios-only",   dir: "safari-xcode-ios", dest: "generic/platform=iOS" },
];

let allPassed = true;

for (const target of targets) {
  const outDir = path.join(__dirname, "..", target.dir);

  // Generate Xcode project
  console.log(`🔨 [${target.name}] Generating Xcode project...`);
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });

  try {
    execSync(
      [
        "xcrun safari-web-extension-converter",
        `"${distSafari}"`,
        "--project-location", `"${outDir}"`,
        '--app-name', '"Rug Munch Intelligence"',
        "--bundle-identifier", APP_BUNDLE_ID,
        "--swift", target.flag, "--no-open", "--no-prompt",
      ].join(" "),
      { stdio: "pipe" }
    );
  } catch (e) {
    // Converter prints warnings to stderr but still succeeds
    if (!fs.existsSync(path.join(outDir, "Rug Munch Intelligence"))) {
      console.error(`❌ [${target.name}] Converter failed`);
      allPassed = false;
      continue;
    }
  }

  // Fix bundle IDs — extension must be child of app
  const projDir = path.join(outDir, "Rug Munch Intelligence");
  const pbxproj = path.join(projDir, "Rug Munch Intelligence.xcodeproj", "project.pbxproj");
  let pbx = fs.readFileSync(pbxproj, "utf-8");
  // Replace any extension bundle ID that doesn't match the expected pattern
  pbx = pbx.replace(
    /PRODUCT_BUNDLE_IDENTIFIER = ".*?\.Extension"/g,
    `PRODUCT_BUNDLE_IDENTIFIER = "${APP_BUNDLE_ID}.Extension"`
  );
  fs.writeFileSync(pbxproj, pbx);

  // Build
  console.log(`🏗️  [${target.name}] Building...`);
  try {
    execSync(
      [
        "xcodebuild",
        `-scheme "Rug Munch Intelligence"`,
        "-configuration Release",
        `-destination "${target.dest}"`,
        `DEVELOPMENT_TEAM=${TEAM_ID}`,
        `CODE_SIGN_IDENTITY="Apple Development"`,
        "CODE_SIGN_STYLE=Automatic",
        "build",
      ].join(" "),
      { cwd: projDir, stdio: "pipe", timeout: 120000 }
    );
    console.log(`✅ [${target.name}] BUILD SUCCEEDED\n`);
  } catch (e) {
    const output = (e.stdout || "").toString();
    if (output.includes("BUILD SUCCEEDED")) {
      console.log(`✅ [${target.name}] BUILD SUCCEEDED\n`);
    } else {
      console.error(`❌ [${target.name}] BUILD FAILED`);
      console.error(output.split("\n").slice(-10).join("\n"));
      allPassed = false;
    }
  }
}

if (allPassed) {
  console.log("🎯 All Safari builds succeeded!");
  console.log("   macOS app: ~/Library/Developer/Xcode/DerivedData/Rug_Munch_Intelligence-*/Build/Products/Release/");
  console.log("   iOS app:   ~/Library/Developer/Xcode/DerivedData/Rug_Munch_Intelligence-*/Build/Products/Release-iphoneos/");
  console.log("\n   To enable: Safari > Settings > Extensions > ✅ Rug Munch Intelligence");
} else {
  console.error("\n⚠️  Some builds failed. Check output above.");
  process.exit(1);
}
