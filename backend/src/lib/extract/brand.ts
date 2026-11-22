import * as cheerio from "cheerio";
import { withPage, saveShot } from "../browser";
import { safeFetch } from "../safe-fetch";
import { toHex, saturation, readableOn, luminance, isHex, parseColor } from "../color";
import type { BrandProfileData, ProductData } from "@/shared/types";

/** Fonts available in Shopify's font library (handle prefix). Used to map detected families to font_picker defaults. */
const SHOPIFY_FONTS: Record<string, { handle: string; serif: boolean }> = {
  assistant: { handle: "assistant", serif: false },
  inter: { handle: "inter", serif: false },
  poppins: { handle: "poppins", serif: false },
  montserrat: { handle: "montserrat", serif: false },
  roboto: { handle: "roboto", serif: false },
  lato: { handle: "lato", serif: false },
  "open sans": { handle: "open_sans", serif: false },
  "playfair display": { handle: "playfair_display", serif: true },
  lora: { handle: "lora", serif: true },
  "dm sans": { handle: "dm_sans", serif: false },
  "work sans": { handle: "work_sans", serif: false },
  nunito: { handle: "nunito", serif: false },
  "nunito sans": { handle: "nunito_sans", serif: false },
  raleway: { handle: "raleway", serif: false },
  merriweather: { handle: "merriweather", serif: true },
  oswald: { handle: "oswald", serif: false },
  "cormorant garamond": { handle: "cormorant_garamond", serif: true },
  "space grotesk": { handle: "space_grotesk", serif: false },
  "libre baskerville": { handle: "libre_baskerville", serif: true },
  "josefin sans": { handle: "josefin_sans", serif: false },
  archivo: { handle: "archivo", serif: false },
  "source sans pro": { handle: "source_sans_pro", serif: false },
  "pt serif": { handle: "pt_serif", serif: true },
  rubik: { handle: "rubik", serif: false },
  karla: { handle: "karla", serif: false },
  "barlow": { handle: "barlow", serif: false },
  mulish: { handle: "mulish", serif: false },
  "ibm plex sans": { handle: "ibm_plex_sans", serif: false },
};

const SYSTEM_FONT = /^(var\(|-apple-system|system-ui|blinkmacsystemfont|segoe ui|helvetica|arial|sans-serif|serif|inherit|initial)/i;

export function mapShopifyFont(familyRaw: string, weight: string | number, role: "heading" | "body") {
  const cleaned = familyRaw.replace(/!important/gi, "").replace(/["']/g, "").trim();
  const family = SYSTEM_FONT.test(cleaned) ? "" : cleaned;
  const key = family.toLowerCase();
  const w = Number(weight) >= 600 ? 7 : 4;
  const hit = SHOPIFY_FONTS[key];
  if (hit) return { family: family.replace(/["']/g, "").trim(), handle: `${hit.handle}_n${w}`, fallback: false };
  const serifGuess = /serif|georgia|times|garamond|baskerville|didot|playfair/i.test(key) && !/sans/i.test(key);
  const fb = serifGuess ? "playfair_display" : role === "heading" ? "poppins" : "inter";
  return { family: family.replace(/["']/g, "").trim() || fb, handle: `${fb}_n${w}`, fallback: true };
}

export const SHOPIFY_FONT_OPTIONS = Object.entries(SHOPIFY_FONTS).map(([family, v]) => ({ family: family.replace(/\b\w/g, (c) => c.toUpperCase()), handle: v.handle }));

function toneFrom(product: ProductData): string {
  const text = `${product.title} ${product.description} ${product.tags.join(" ")}`.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/organic|natural|ayurved|herbal|plant|vegan|wellness|skin/, "Natural, calm and trustworthy"],
    [/luxury|premium|handcrafted|artisan|leather|silk|gold/, "Refined, premium and understated"],
    [/bluetooth|wireless|battery|smart|tech|speaker|earbuds|watch|usb/, "Energetic, modern and spec-confident"],
    [/kids|baby|toy|play|fun/, "Warm, playful and reassuring"],
    [/protein|fitness|gym|workout|sport|running/, "Motivating, direct and performance-led"],
  ];
  return rules.find(([re]) => re.test(text))?.[1] ?? "Clear, friendly and benefit-led";
}

interface RawStyles {
  bodyFont: string; headingFont: string; bodyBg: string; bodyColor: string;
  h1Size: string; h1Weight: string; h2Size: string; bodySize: string; bodyWeight: string;
  btn: { bg: string; color: string; radius: string; padY: string; padX: string; transform: string; weight: string } | null;
  accents: string[]; headerBg: string; footerBg: string;
}

// Plain JS string (not a TS function) so bundlers/transpilers cannot inject helpers like __name into the page context.
const STYLE_PROBE = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const fam = (s) => (s ? s.fontFamily.split(",")[0] : "").replace(/["']/g, "").trim();
  const body = cs(document.body);
  const h1El = document.querySelector("h1");
  const h1 = cs(h1El) || body;
  const h2 = cs(document.querySelector("h2")) || h1;
  const solid = (c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent";
  const bg = (el) => {
    let n = el;
    while (n) { const c = getComputedStyle(n).backgroundColor; if (solid(c)) return c; n = n.parentElement; }
    return "rgb(255, 255, 255)";
  };
  const btnEl = document.querySelector('form[action*="/cart/add"] [type="submit"], button[name="add"], .product-form__submit, [class*="add-to-cart" i], [class*="AddToCart" i], button[type="submit"]');
  const bs = cs(btnEl);
  const accents = [];
  document.querySelectorAll("button, a[class*=btn i], a[class*=button i], [class*=badge i], [class*=price i], h1, h2, a").forEach((el, i) => {
    if (i > 220) return;
    const s = getComputedStyle(el);
    [s.backgroundColor, s.color, s.borderTopColor].forEach((c) => { if (solid(c)) accents.push(c); });
  });
  return {
    bodyFont: fam(body), headingFont: fam(h1),
    bodyBg: bg(document.body), bodyColor: body.color,
    h1Size: h1.fontSize, h1Weight: h1.fontWeight, h2Size: h2.fontSize, bodySize: body.fontSize, bodyWeight: body.fontWeight,
    btn: bs && btnEl ? { bg: bg(btnEl), color: bs.color, radius: bs.borderRadius, padY: bs.paddingTop, padX: bs.paddingLeft, transform: bs.textTransform, weight: bs.fontWeight } : null,
    accents,
    headerBg: bg(document.querySelector("header")),
    footerBg: bg(document.querySelector("footer")),
  };
})()`;

export async function extractBrand(product: ProductData, html: string, productId: string): Promise<{ profile: BrandProfileData; screenshots: { desktop?: string; mobile?: string } }> {
  const notes: string[] = [];
  const screenshots: { desktop?: string; mobile?: string } = {};
  let raw: RawStyles | null = null;

  try {
    raw = await withPage(product.sourceUrl, {}, async ({ page }) => {
      const r = (await page.evaluate(STYLE_PROBE)) as RawStyles;
      screenshots.desktop = (await saveShot(page, `${productId}-desktop`)) ?? undefined;
      return r;
    });
    await withPage(product.sourceUrl, { mobile: true }, async ({ page }) => {
      screenshots.mobile = (await saveShot(page, `${productId}-mobile`)) ?? undefined;
    });
  } catch (e) {
    notes.push(`Browser inspection failed: ${(e as Error).message.split("\n")[0]}`);
  }

  if (!raw) {
    notes.push("Playwright/Chromium unavailable or failed; used HTML/CSS heuristics (lower confidence). Screenshots were not captured.");
    raw = await heuristicStyles(html, product.origin, notes);
  }

  const bodyBg = toHex(raw.bodyBg, "#ffffff");
  const text = toHex(raw.bodyColor, "#111111");
  const counts = new Map<string, number>();
  raw.accents.forEach((c) => {
    const hex = toHex(c);
    const lum = luminance(hex);
    if (saturation(hex) > 0.28 && lum > 0.03 && lum < 0.85) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const btnBg = raw.btn ? toHex(raw.btn.bg, "") : "";
  const primary = ranked[0] ?? (isHex(btnBg) && saturation(btnBg) > 0.1 ? btnBg : isHex(btnBg) ? btnBg : "#1f2937");
  const secondary =
    ranked.find((c) => c !== primary) ??
    [toHex(raw.footerBg), toHex(raw.headerBg)].find((c) => c !== bodyBg && c !== primary) ??
    "#475569";
  const button = isHex(btnBg) ? btnBg : primary;
  const buttonText = raw.btn ? toHex(raw.btn.color, readableOn(button)) : readableOn(button);

  const heading = mapShopifyFont(raw.headingFont || raw.bodyFont || "Poppins", raw.h1Weight, "heading");
  const body = mapShopifyFont(raw.bodyFont || "Inter", raw.bodyWeight, "body");
  if (heading.fallback) notes.push(`Heading font "${heading.family}" is not in the bundled Shopify font list; font_picker default falls back to ${heading.handle}.`);
  if (body.fallback) notes.push(`Body font "${body.family}" is not in the bundled Shopify font list; font_picker default falls back to ${body.handle}.`);

  const radiusPx = parseFloat(raw.btn?.radius ?? "8") || 0;
  const style = radiusPx >= 24 ? "soft, pill-shaped" : radiusPx <= 2 ? "sharp, editorial" : "balanced, rounded";
  const profile: BrandProfileData = {
    name: product.vendor,
    tone: toneFrom(product),
    toneSource: "heuristic",
    colors: { primary, secondary, background: bodyBg, text, button, buttonText },
    fonts: { heading: heading.family, body: body.family, headingHandle: heading.handle, bodyHandle: body.handle, headingFallback: heading.fallback, bodyFallback: body.fallback },
    typography: { h1Size: raw.h1Size, h1Weight: raw.h1Weight, h2Size: raw.h2Size, bodySize: raw.bodySize, bodyWeight: raw.bodyWeight },
    button: { radius: raw.btn?.radius ?? "8px", paddingY: raw.btn?.padY ?? "14px", paddingX: raw.btn?.padX ?? "24px", textTransform: raw.btn?.transform ?? "none", fontWeight: raw.btn?.weight ?? "600" },
    visualStyle: { radius: Math.min(32, Math.round(radiusPx)), spacing: "regular", style },
    extractionMethod: raw === null ? "html-css-heuristic" : notes.some((n) => n.startsWith("Playwright/Chromium unavailable")) ? "html-css-heuristic" : "playwright-computed-styles",
    notes,
  };
  if (!parseColor(profile.colors.primary)) profile.colors.primary = "#1f2937";
  return { profile, screenshots };
}

async function heuristicStyles(html: string, origin: string, notes: string[]): Promise<RawStyles> {
  const $ = cheerio.load(html || "<html></html>");
  let css = $("style").map((_, el) => $(el).text()).get().join("\n");
  const links = $('link[rel="stylesheet"]').map((_, el) => $(el).attr("href")).get().slice(0, 3);
  for (const href of links) {
    if (!href) continue;
    try {
      const r = await safeFetch(new URL(href, origin).toString(), { maxBytes: 600_000, timeoutMs: 8000 });
      if (r.status === 200) css += "\n" + r.text;
    } catch {
      notes.push(`Could not fetch stylesheet ${href}`);
    }
  }
  const v = (re: RegExp) => css.match(re)?.[1]?.trim();
  const themeColor = $('meta[name="theme-color"]').attr("content");
  const hexOf = (s?: string) => (s ? toHex(s, "") : "");
  const accents = [v(/--color-(?:button|accent|primary)[a-z-]*:\s*([^;]+);/i), v(/--color-base-accent-1:\s*([^;]+);/i), themeColor].filter(Boolean).map((s) => hexOf(s as string)).filter(Boolean);
  const fam = (re: RegExp) => v(re)?.split(",")[0].replace(/["']/g, "").trim() ?? "";
  const bodyFont = fam(/--font-body-family:\s*([^;]+);/i) || fam(/body\s*\{[^}]*font-family:\s*([^;}]+)/i) || fam(/font-family:\s*([^;}]+)/i);
  const headingFont = fam(/--font-heading-family:\s*([^;]+);/i) || fam(/h1[^{]*\{[^}]*font-family:\s*([^;}]+)/i) || bodyFont;
  return {
    bodyFont, headingFont,
    bodyBg: v(/--color-background:\s*([^;]+);/i) ?? v(/--color-base-background-1:\s*([^;]+);/i) ?? "#ffffff",
    bodyColor: v(/--color-foreground:\s*([^;]+);/i) ?? v(/--color-base-text:\s*([^;]+);/i) ?? "#111111",
    h1Size: "unknown", h1Weight: "700", h2Size: "unknown", bodySize: "16px", bodyWeight: "400",
    btn: accents[0] ? { bg: accents[0], color: readableOn(accents[0]), radius: v(/--buttons-radius:\s*([^;]+);/i) ?? "8px", padY: "14px", padX: "24px", transform: "none", weight: "600" } : null,
    accents, headerBg: "", footerBg: "",
  };
}
