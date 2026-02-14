#!/usr/bin/env node
/**
 * Post-build: Bundle Safari content scripts as self-contained IIFEs using esbuild.
 * 
 * Safari iOS blocks dynamic import() + chrome.runtime.getURL() in content scripts.
 * This script re-bundles each content script from source as a single IIFE file,
 * then replaces the CRXJS loader in dist-safari/.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist-safari");
const SRC = path.join(__dirname, "..", "src", "content");

const scripts = [
  "dexscreener",
  "pumpfun",
  "jupiter",
  "gmgn",
  "bullx",
  "birdeye",
  "raydium",
  "photon",
];

console.log(`\n🔧 Bundling ${scripts.length} Safari content scripts with esbuild...\n`);

const assetsDir = path.join(DIST, "assets");
let success = 0;

for (const name of scripts) {
  const srcFile = path.join(SRC, `${name}.tsx`);
  if (!fs.existsSync(srcFile)) {
    console.log(`  ⚠️ ${name}.tsx not found`);
    continue;
  }

  // Find the loader file for this script
  const loaderFiles = fs.readdirSync(assetsDir).filter(
    (f) => f.startsWith(`${name}.tsx-loader-`) && f.endsWith(".js")
  );

  if (loaderFiles.length === 0) {
    console.log(`  ⚠️ No loader found for ${name}`);
    continue;
  }

  const loaderPath = path.join(assetsDir, loaderFiles[0]);
  const outFile = path.join(assetsDir, `${name}-safari-bundled.js`);

  try {
    // Bundle with esbuild as IIFE
    execSync(
      `npx esbuild "${srcFile}" ` +
        `--bundle ` +
        `--format=iife ` +
        `--platform=browser ` +
        `--target=safari16 ` +
        `--minify ` +
        `--outfile="${outFile}" ` +
        `--define:process.env.NODE_ENV='"production"' ` +
        `--loader:.tsx=tsx --loader:.ts=ts ` +
        `--jsx=automatic ` +
        `--tsconfig=tsconfig.json`,
      { cwd: path.join(__dirname, ".."), stdio: "pipe" }
    );

    // Replace loader content with bundled content
    const bundled = fs.readFileSync(outFile, "utf8");
    fs.writeFileSync(loaderPath, bundled);
    fs.unlinkSync(outFile); // Clean up temp file

    const size = (Buffer.byteLength(bundled) / 1024).toFixed(1);
    console.log(`  ✅ ${name}: ${size}KB (IIFE bundle)`);
    success++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message.split("\n")[0]}`);
  }
}

// Also update manifest.json to reference the loader files (they now contain the full bundle)
// No changes needed since the loaders are overwritten in-place

console.log(`\n✅ ${success}/${scripts.length} content scripts bundled for Safari\n`);
