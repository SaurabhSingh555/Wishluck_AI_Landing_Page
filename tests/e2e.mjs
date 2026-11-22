// Real-browser tests of every generated design: responsive layout, H1, variant selection, price updates,
// sold-out handling, add-to-cart wiring (cart permalink in preview mode), sticky mobile ATC. Writes screenshots + JSON.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const runs = JSON.parse(fs.readFileSync("tests/artifacts/runs.json", "utf8")).filter((r) => r.runId);
const shotDir = "tests/artifacts/screenshots";
fs.mkdirSync(shotDir, { recursive: true });
const fmt = (minor, cur) => { const a = minor / 100; try { return cur ? new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: a % 1 === 0 ? 0 : 2 }).format(a) : a.toFixed(2); } catch { return a.toFixed(2); } };
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const results = [];
const _visible = async (loc) => { const b = await loc.boundingBox().catch(() => null); return !!b && (await loc.isVisible()); };
for (const r of runs) {
  const bundle = await (await fetch(`${BASE}/api/runs/${r.runId}`)).json();
  const product = bundle.product.data;
  for (const d of bundle.designs) {
    const rec = { product: product.handle, design: d.label, id: d.id, checks: {}, failures: [] };
    const fail = (m) => rec.failures.push(m);
    for (const [name, w, h] of [["mobile", 360, 740], ["tablet", 768, 1024], ["desktop", 1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: name === "mobile", hasTouch: name === "mobile" });
      const page = await ctx.newPage();
      await page.route(/^https?:\/\/(?!localhost)(?!127\.0\.0\.1)(?!fonts\.)(?!cdn\.shopify\.com).*/, (rt) => rt.abort());
      await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
      await page.goto(`${BASE}/preview/${d.id}`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, h1: document.querySelectorAll("h1").length, sections: document.querySelectorAll(".shopify-section").length }));
      rec.checks[`${name}-no-horizontal-overflow`] = m.sw <= w + 1; // compare with the DECLARED width: mobile browsers silently zoom out on overflow
      if (m.sw > w + 1) fail(`${name}: horizontal overflow ${m.sw}>${w}`);
      if (m.h1 !== 1) fail(`${name}: ${m.h1} H1 elements`);
      if (name === "mobile") {
        const atc = page.locator("form [data-wl-atc]").first();
        const sticky = page.locator(".wl-sticky [data-wl-atc]").first();
        const inView = async (loc) => { const b = await loc.boundingBox(); return !!b && b.y >= 0 && b.y + b.height <= h && (await loc.isVisible()); };
        const ok = (await inView(atc).catch(() => false)) || (await inView(sticky).catch(() => false));
        rec.checks["mobile-atc-visible-first-viewport"] = ok;
        rec.checks["mobile-atc-inline-in-first-viewport"] = await inView(atc).catch(() => false);
        if (!ok) fail("mobile: add-to-cart not visible in first viewport (inline or sticky)");
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(300);
        // After scrolling, an add-to-cart control must still be reachable: the sticky bar, or the inline button if it happens to be on screen.
        rec.checks["mobile-sticky-visible-after-scroll"] = (await sticky.isVisible()) || (await inView(atc).catch(() => false));
        if (!rec.checks["mobile-sticky-visible-after-scroll"]) fail("mobile: no add-to-cart control reachable after scrolling");
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      if (name === "desktop") {
        // ---- variants + add-to-cart on desktop viewport ----
        const tested = [];
        for (const v of product.variants.slice(0, 8)) {
          for (let i = 0; i < product.options.length; i++) {
            const val = v.options[i];
            const input = page.locator(".wl-option").nth(i).locator(`input[value="${val.replace(/"/g, '&quot;')}"]`).first();
            if (product.options.length && !(product.options.length === 1 && product.options[0].name === "Title" && product.options[0].values.length === 1)) await page.locator(`label[for="${await input.getAttribute("id")}"]`).click();
          }
          const price = (await page.locator("[data-wl-price]").first().textContent())?.trim();
          const idVal = await page.locator("[data-wl-variant-id]").first().inputValue();
          const disabled = await page.locator("form [data-wl-atc]").first().isDisabled();
          const okPrice = price === fmt(v.price, product.currency).replace(/\u00a0/g, " ") || price?.replace(/\u00a0/g, " ") === fmt(v.price, product.currency).replace(/\u00a0/g, " ");
          const t = { id: v.id, price, expected: fmt(v.price, product.currency), idMatches: String(v.id) === idVal, priceMatches: okPrice, soldOutHandled: disabled === !v.available };
          if (v.available) {
            await page.evaluate(() => { window.__opened = []; });
            await page.locator("form [data-wl-atc]").first().click();
            await page.waitForTimeout(150);
            const opened = await page.evaluate(() => window.__opened);
            t.cartPermalink = opened[0] ?? null;
            t.addToCartTargetsVariant = !!opened[0] && opened[0].includes(`/cart/${v.id}:`);
          }
          tested.push(t);
          if (!t.idMatches || !t.priceMatches || !t.soldOutHandled || (v.available && !t.addToCartTargetsVariant)) fail(`variant ${v.id}: ${JSON.stringify(t)}`);
        }
        rec.variantTests = tested;
        // quantity
        await page.locator("[data-wl-qty='1']").first().click().catch(() => undefined);
        rec.checks["quantity-increments"] = (await page.locator("input[name=quantity]").first().inputValue().catch(() => "1")) === "2";
      }
      await page.screenshot({ path: path.join(shotDir, `${product.handle.slice(0, 24)}-${d.archetype}-${name}.jpg`), type: "jpeg", quality: 55, fullPage: name !== "tablet" });
      await ctx.close();
    }
    rec.passed = rec.failures.length === 0;
    results.push(rec);
    console.log(rec.passed ? "PASS" : "FAIL", product.handle.slice(0, 30), d.label, rec.failures.slice(0, 2).join(" | "));
  }
}
await browser.close();
const summary = { ranAt: new Date().toISOString(), designs: results.length, passed: results.filter((r) => r.passed).length, results };
fs.writeFileSync("tests/artifacts/e2e-results.json", JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.designs} designs passed`);
process.exit(summary.passed === summary.designs ? 0 : 1);
