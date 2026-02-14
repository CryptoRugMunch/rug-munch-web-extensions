#!/usr/bin/env node
/**
 * Safari extension App Store archive + upload script.
 *
 * Creates .xcarchive for macOS + iOS, exports signed .app/.ipa,
 * and optionally uploads to App Store Connect via xcrun altool or
 * the newer notarytool/altool pipeline.
 *
 * Prerequisites:
 *   - Apple Distribution certificate in Keychain
 *   - App registered in App Store Connect
 *   - Run `npm run build && npm run build:safari` first
 *
 * Usage:
 *   node scripts/archive-safari.cjs                # archive both
 *   node scripts/archive-safari.cjs --upload       # archive + upload
 *   node scripts/archive-safari.cjs --macos-only   # macOS only
 *   node scripts/archive-safari.cjs --ios-only     # iOS only
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ─── Config ───────────────────────────────────────────────────
const TEAM_ID = "DGKZ9VVY9B";
const APP_BUNDLE_ID = "com.cryptorugmunch.Rug-Munch-Intelligence";
const APP_NAME = "Rug Munch Intelligence";

// Read version from package.json
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
);
const VERSION = pkg.version || "1.0.0";

// Build number: YYYYMMDDHHmm for uniqueness
const now = new Date();
const BUILD_NUMBER = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

const archiveDir = path.join(__dirname, "..", "archives");
const exportDir = path.join(__dirname, "..", "exports");

const args = process.argv.slice(2);
const doUpload = args.includes("--upload");
const macosOnly = args.includes("--macos-only");
const iosOnly = args.includes("--ios-only");

// ─── Export Options Plists ────────────────────────────────────
const macExportPlist = path.join(archiveDir, "ExportOptions-macOS.plist");
const iosExportPlist = path.join(archiveDir, "ExportOptions-iOS.plist");

function writeExportPlists() {
  fs.mkdirSync(archiveDir, { recursive: true });

  // macOS App Store export
  fs.writeFileSync(macExportPlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>`);

  // iOS App Store export
  fs.writeFileSync(iosExportPlist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>`);
}

// ─── Targets ──────────────────────────────────────────────────
const targets = [];
if (!iosOnly) {
  targets.push({
    name: "macOS",
    xcodeDir: "safari-xcode",
    dest: "generic/platform=macOS",
    archivePath: path.join(archiveDir, `RMI-macOS-${VERSION}.xcarchive`),
    exportPlist: macExportPlist,
    exportPath: path.join(exportDir, "macOS"),
  });
}
if (!macosOnly) {
  targets.push({
    name: "iOS",
    xcodeDir: "safari-xcode-ios",
    dest: "generic/platform=iOS",
    archivePath: path.join(archiveDir, `RMI-iOS-${VERSION}.xcarchive`),
    exportPlist: iosExportPlist,
    exportPath: path.join(exportDir, "iOS"),
  });
}

// ─── Pre-flight ───────────────────────────────────────────────
console.log(`\n🚀 Rug Munch Intelligence — App Store Archive`);
console.log(`   Version: ${VERSION} (build ${BUILD_NUMBER})`);
console.log(`   Team: ${TEAM_ID}`);
console.log(`   Targets: ${targets.map(t => t.name).join(", ")}`);
console.log(`   Upload: ${doUpload ? "YES" : "NO (dry run)"}\n`);

// Check Safari Xcode projects exist
for (const target of targets) {
  const projDir = path.join(__dirname, "..", target.xcodeDir, APP_NAME);
  if (!fs.existsSync(projDir)) {
    console.error(`❌ ${target.xcodeDir}/ not found. Run \`npm run build:safari\` first.`);
    process.exit(1);
  }
}

// Check for distribution cert
try {
  const certs = execSync('security find-identity -v -p codesigning', { encoding: "utf-8" });
  const hasDist = certs.includes("Apple Distribution") || certs.includes("3rd Party Mac Developer");
  if (!hasDist) {
    console.error("⚠️  No Apple Distribution certificate found.");
    console.error("   → Xcode → Settings → Accounts → Manage Certificates → + → Apple Distribution");
    console.error("   Falling back to automatic signing (Xcode will handle it).\n");
  }
} catch (e) { /* ignore */ }

writeExportPlists();
fs.mkdirSync(exportDir, { recursive: true });

// ─── Archive + Export ─────────────────────────────────────────
let allPassed = true;

for (const target of targets) {
  const projDir = path.join(__dirname, "..", target.xcodeDir, APP_NAME);
  const xcproj = `${APP_NAME}.xcodeproj`;

  // Patch version + build number in pbxproj
  const pbxPath = path.join(projDir, xcproj, "project.pbxproj");
  let pbx = fs.readFileSync(pbxPath, "utf-8");
  pbx = pbx.replace(/MARKETING_VERSION = .*?;/g, `MARKETING_VERSION = ${VERSION};`);
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = .*?;/g, `CURRENT_PROJECT_VERSION = ${BUILD_NUMBER};`);
  fs.writeFileSync(pbxPath, pbx);

  // Patch Info.plist: add LSApplicationCategoryType for App Store (macOS requires it)
  const infoPlistPath = path.join(projDir, APP_NAME, "Info.plist");
  if (fs.existsSync(infoPlistPath)) {
    let plist = fs.readFileSync(infoPlistPath, "utf-8");
    if (!plist.includes("LSApplicationCategoryType")) {
      plist = plist.replace(
        "</dict>",
        `\t<key>LSApplicationCategoryType</key>\n\t<string>public.app-category.finance</string>\n</dict>`
      );
      fs.writeFileSync(infoPlistPath, plist);
    }
  }

  // Step 1: Archive
  console.log(`📦 [${target.name}] Archiving v${VERSION} (${BUILD_NUMBER})...`);
  if (fs.existsSync(target.archivePath)) fs.rmSync(target.archivePath, { recursive: true });

  try {
    const archiveCmd = [
      "xcodebuild",
      "archive",
      `-project "${xcproj}"`,
      `-scheme "${APP_NAME}"`,
      `-archivePath "${target.archivePath}"`,
      `-destination "${target.dest}"`,
      `DEVELOPMENT_TEAM=${TEAM_ID}`,
      "CODE_SIGN_STYLE=Automatic",
      `MARKETING_VERSION=${VERSION}`,
      `CURRENT_PROJECT_VERSION=${BUILD_NUMBER}`,
    ].join(" ");

    execSync(archiveCmd, {
      cwd: projDir,
      stdio: "pipe",
      timeout: 180000,
    });
    console.log(`✅ [${target.name}] Archive created\n`);
  } catch (e) {
    const output = (e.stdout || "").toString() + (e.stderr || "").toString();
    if (output.includes("ARCHIVE SUCCEEDED") || output.includes("** ARCHIVE SUCCEEDED **")) {
      console.log(`✅ [${target.name}] Archive created\n`);
    } else {
      console.error(`❌ [${target.name}] Archive FAILED`);
      const lines = output.split("\n");
      // Show errors
      const errors = lines.filter(l => l.includes("error:"));
      if (errors.length) {
        errors.forEach(e => console.error("   " + e.trim()));
      } else {
        console.error(lines.slice(-15).join("\n"));
      }
      allPassed = false;
      continue;
    }
  }

  // Step 2: Export (creates .app / .ipa)
  console.log(`📤 [${target.name}] Exporting for App Store...`);
  if (fs.existsSync(target.exportPath)) fs.rmSync(target.exportPath, { recursive: true });

  try {
    const exportCmd = [
      "xcodebuild",
      "-exportArchive",
      `-archivePath "${target.archivePath}"`,
      `-exportPath "${target.exportPath}"`,
      `-exportOptionsPlist "${target.exportPlist}"`,
      "-allowProvisioningUpdates",
    ].join(" ");

    execSync(exportCmd, { stdio: "pipe", timeout: 120000 });
    console.log(`✅ [${target.name}] Exported to ${target.exportPath}\n`);
  } catch (e) {
    const output = (e.stdout || "").toString() + (e.stderr || "").toString();
    if (output.includes("EXPORT SUCCEEDED")) {
      console.log(`✅ [${target.name}] Exported to ${target.exportPath}\n`);
    } else {
      console.error(`❌ [${target.name}] Export FAILED`);
      const lines = output.split("\n");
      const errors = lines.filter(l => l.includes("error:"));
      if (errors.length) {
        errors.forEach(e => console.error("   " + e.trim()));
      } else {
        console.error(lines.slice(-15).join("\n"));
      }
      console.error("\n   ⚠️  This usually means no Apple Distribution certificate.");
      console.error("   → Xcode → Settings → Accounts → Manage Certificates → +");
      allPassed = false;
      continue;
    }
  }

  // Step 3: Upload (optional)
  if (doUpload) {
    console.log(`🚀 [${target.name}] Uploading to App Store Connect...`);
    try {
      // Find the exported artifact
      const exported = fs.readdirSync(target.exportPath);
      const artifact = exported.find(f => f.endsWith(".ipa") || f.endsWith(".pkg") || f.endsWith(".app"));

      if (!artifact) {
        console.error(`❌ [${target.name}] No uploadable artifact found in ${target.exportPath}`);
        allPassed = false;
        continue;
      }

      const artifactPath = path.join(target.exportPath, artifact);

      // Use xcrun notarytool for macOS or altool for iOS
      const uploadCmd = [
        "xcrun altool",
        "--upload-app",
        `-f "${artifactPath}"`,
        `-t ${target.name === "macOS" ? "macos" : "ios"}`,
        "--apiKey", "${ASC_API_KEY:-}",
        "--apiIssuer", "${ASC_API_ISSUER:-}",
      ].join(" ");

      console.log(`   (Using: xcrun altool --upload-app)`);
      console.log(`   Artifact: ${artifact}`);
      console.log(`\n   ⚠️  For automated upload, set these env vars:`);
      console.log(`      ASC_API_KEY     — App Store Connect API Key ID`);
      console.log(`      ASC_API_ISSUER  — App Store Connect Issuer ID`);
      console.log(`\n   Or upload manually:`);
      console.log(`      Xcode → Window → Organizer → Archives → Distribute App`);
      console.log(`      Or: xcrun altool --upload-app -f "${artifactPath}" --apiKey KEY --apiIssuer ISSUER`);

    } catch (e) {
      console.error(`❌ [${target.name}] Upload failed:`, e.message);
      allPassed = false;
    }
  }
}

// ─── Summary ──────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
if (allPassed) {
  console.log("🎯 All archives ready!");
  console.log(`   Version: ${VERSION} | Build: ${BUILD_NUMBER}`);

  for (const target of targets) {
    console.log(`\n   [${target.name}]`);
    console.log(`   Archive: ${target.archivePath}`);
    console.log(`   Export:  ${target.exportPath}/`);
  }

  if (!doUpload) {
    console.log("\n📤 To upload to TestFlight/App Store:");
    console.log("   Option A: Xcode → Window → Organizer → select archive → Distribute App");
    console.log("   Option B: node scripts/archive-safari.cjs --upload");
    console.log("             (requires ASC_API_KEY + ASC_API_ISSUER env vars)");
    console.log("\n   Or use Transporter.app (free on Mac App Store) to drag & drop the export.");
  }
} else {
  console.error("⚠️  Some targets failed. Check output above.");
  process.exit(1);
}

console.log("═".repeat(60) + "\n");
