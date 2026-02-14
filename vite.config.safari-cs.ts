/**
 * Separate Vite build for Safari content scripts.
 * Bundles each content script as a self-contained IIFE (no dynamic imports).
 * Safari iOS blocks dynamic import() from chrome.runtime.getURL() in content scripts.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const contentScripts = [
  "dexscreener",
  "pumpfun", 
  "jupiter",
  "gmgn",
  "bullx",
  "birdeye",
  "raydium",
  "photon",
];

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-safari-cs",
    emptyDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        contentScripts.map((name) => [
          name,
          resolve(__dirname, `src/content/${name}.tsx`),
        ])
      ),
      output: {
        format: "iife",
        entryFileNames: "[name].js",
        // Bundle everything into each file — no code splitting
        manualChunks: undefined,
        inlineDynamicImports: false,
      },
    },
    // Don't minify for debugging
    minify: "esbuild",
    // No CSS code splitting
    cssCodeSplit: false,
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
