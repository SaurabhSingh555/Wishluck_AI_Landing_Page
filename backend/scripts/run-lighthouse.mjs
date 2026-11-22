// Runs a real Lighthouse audit (mobile emulation by default) against a URL using Playwright's Chromium.
// Usage: node scripts/run-lighthouse.mjs <url> <out.json> [desktop]
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const [, , url, out, form] = process.argv;
if (!url || !out) { console.error("usage: run-lighthouse.mjs <url> <out.json> [desktop]"); process.exit(2); }
const { chromium } = require("playwright-core");
const chromeLauncher = await import("chrome-launcher");
const { default: lighthouse } = await import("lighthouse");
const chromePath = process.env.CHROMIUM_PATH || chromium.executablePath();
const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
try {
  const config = form === "desktop" ? (await import("lighthouse/core/config/desktop-config.js")).default : undefined;
  const r = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "seo", "best-practices"] }, config);
  const lhr = r.lhr;
  const cat = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
  const audit = (k) => lhr.audits[k]?.displayValue ?? null;
  const result = {
    url, form: form ?? "mobile", lighthouseVersion: lhr.lighthouseVersion, fetchTime: lhr.fetchTime,
    scores: { performance: cat("performance"), accessibility: cat("accessibility"), seo: cat("seo"), bestPractices: cat("best-practices") },
    metrics: { fcp: audit("first-contentful-paint"), lcp: audit("largest-contentful-paint"), tbt: audit("total-blocking-time"), cls: audit("cumulative-layout-shift"), speedIndex: audit("speed-index") },
    failedAudits: Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === "binary" || (a.score !== null && a.score < 0.5 && a.scoreDisplayMode === "numeric")).slice(0, 12).map((a) => ({ id: a.id, title: a.title, score: a.score })),
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.scores));
} finally {
  await chrome.kill();
}
