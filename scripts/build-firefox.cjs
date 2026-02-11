#!/usr/bin/env node
/**
 * Firefox manifest generator.
 *
 * Takes the Chrome manifest and:
 * 1. Adds browser_specific_settings.gecko
 * 2. Replaces sidePanel with sidebar_action
 * 3. Removes Chrome-only permissions
 * 4. Outputs to dist-firefox/
 */

const fs = require("fs");
const path = require("path");

const distChrome = path.join(__dirname, "..", "dist");
const distFirefox = path.join(__dirname, "..", "dist-firefox");

// Copy entire dist to dist-firefox
fs.cpSync(distChrome, distFirefox, { recursive: true });

// Read and transform manifest
const manifest = JSON.parse(
  fs.readFileSync(path.join(distFirefox, "manifest.json"), "utf-8")
);

// Add gecko settings
manifest.browser_specific_settings = {
  gecko: {
    id: "scanner@cryptorugmunch.com",
    strict_min_version: "109.0",
  },
};

// Replace sidePanel with sidebar_action (Firefox equivalent)
if (manifest.side_panel) {
  manifest.sidebar_action = {
    default_title: "Marcus — Rug Munch",
    default_panel: manifest.side_panel.default_path,
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
    },
  };
  delete manifest.side_panel;
}

// Remove Chrome-only permissions
manifest.permissions = manifest.permissions.filter(
  (p) => !["sidePanel"].includes(p)
);

// Remove minimum_chrome_version
delete manifest.minimum_chrome_version;

// Write transformed manifest
fs.writeFileSync(
  path.join(distFirefox, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);

console.log("✅ Firefox build ready at dist-firefox/");
console.log("   Gecko ID: scanner@cryptorugmunch.com");
console.log("   Min Firefox: 109.0");
