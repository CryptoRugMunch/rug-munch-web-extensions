/**
 * Rug Munch UI Catalog — json-render powered
 *
 * Usage:
 *   import { registry, Renderer, scanToSpec } from "../ui-catalog";
 *   const spec = scanToSpec(scanData);
 *   <Renderer spec={spec} registry={registry} />
 */

export { rugMunchCatalog } from "./catalog";
export { registry, Renderer, BRAND_COLORS } from "./registry";
export { scanToSpec, scanToCompactSpec } from "./scanToSpec";
