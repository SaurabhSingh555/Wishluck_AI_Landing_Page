import * as cheerio from "cheerio";
import { safeFetch, assertSafeUrl } from "../safe-fetch";
import type { ProductData, ProductImage, SourcedFact, ReviewData } from "@/shared/types";

const STOP = new Set(["the", "and", "for", "with", "of", "a", "an", "in", "on", "to", "by", "pack", "set", "new", "buy", "online", "best", "combo", "free", "men", "women"]);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function stripHtml(html: string): string {
  return cheerio.load(`<div>${html}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

function flattenLd(raw: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(raw)) raw.forEach((r) => flattenLd(r, out));
  else if (raw && typeof raw === "object") {
    out.push(raw as Json);
    if ((raw as Json)["@graph"]) flattenLd((raw as Json)["@graph"], out);
  }
  return out;
}

function typeOf(node: Json, t: string) {
  const ty = node["@type"];
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
}

function sentenceAround(text: string, idx: number): string {
  const start = Math.max(text.lastIndexOf(".", idx) + 1, text.lastIndexOf("\n", idx) + 1, 0);
  let end = text.indexOf(".", idx);
  if (end === -1) end = Math.min(text.length, idx + 160);
  return text.slice(start, Math.min(end + 1, start + 220)).trim();
}

const POLICY_RULES: Array<{ key: string; label: string; re: RegExp }> = [
  { key: "cod", label: "Cash on delivery", re: /cash on delivery|\bCOD\b/i },
  { key: "free_shipping", label: "Free shipping", re: /free (shipping|delivery)/i },
  { key: "returns", label: "Returns / replacement", re: /\b\d+[- ]day[s]?\s+(easy\s+)?(return|replacement|exchange)|easy returns?|return policy/i },
  { key: "warranty", label: "Warranty", re: /\b\d+[- ]?(year|month|yr)s?\s+warranty|warranty/i },
  { key: "guarantee", label: "Guarantee", re: /money[- ]back|satisfaction guarantee|guaranteed/i },
];

function extractSpecs($: cheerio.CheerioAPI, ld: Json | undefined, source: string): SourcedFact[] {
  const specs: SourcedFact[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string, src: string) => {
    const v = value.replace(/\s+/g, " ").trim();
    const l = label.replace(/\s+/g, " ").trim();
    if (!l || !v || v.length > 160 || l.length > 40) return;
    const k = l.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    specs.push({ key: k.replace(/[^a-z0-9]+/g, "_"), label: l, value: v, source: src });
  };
  if (ld) {
    for (const p of ld.additionalProperty ?? []) if (p?.name && p?.value != null) push(String(p.name), String(p.value), "json-ld");
    for (const k of ["material", "color", "size", "pattern", "gtin13", "gtin", "mpn"]) {
      const v = ld[k];
      if (typeof v === "string" || typeof v === "number") push(k === "gtin13" ? "GTIN" : k[0].toUpperCase() + k.slice(1), String(v), "json-ld");
    }
    const w = ld.weight;
    if (w?.value) push("Weight", `${w.value} ${w.unitText ?? ""}`.trim(), "json-ld");
  }
  const root = cheerio.load(source);
  root("tr").each((_, tr) => {
    const cells = root(tr).find("th,td");
    if (cells.length === 2) push(root(cells[0]).text(), root(cells[1]).text(), "description-table");
  });
  root("li,p").each((_, el) => {
    const t = root(el).text().replace(/\s+/g, " ").trim();
    const m = t.match(/^([A-Za-z][A-Za-z0-9 /&()-]{1,30})\s*[:–]\s*(.{1,140})$/);
    if (m) push(m[1], m[2], "description");
  });
  return specs.slice(0, 16);
}

function extractPolicies(descText: string, ld: Json | undefined): SourcedFact[] {
  const out: SourcedFact[] = [];
  for (const r of POLICY_RULES) {
    const m = r.re.exec(descText);
    if (m) out.push({ key: r.key, label: r.label, value: sentenceAround(descText, m.index), source: "description" });
  }
  const offer = Array.isArray(ld?.offers) ? ld?.offers[0] : ld?.offers;
  if (offer?.hasMerchantReturnPolicy && !out.some((p) => p.key === "returns")) {
    const days = offer.hasMerchantReturnPolicy.merchantReturnDays;
    out.push({ key: "returns", label: "Returns / replacement", value: days ? `${days}-day return window (structured data)` : "Return policy declared in structured data", source: "json-ld" });
  }
  return out;
}

function extractReviews(ld: Json | undefined): ReviewData | null {
  const ar = ld?.aggregateRating;
  if (!ar) return null;
  const ratingValue = Number(ar.ratingValue);
  const reviewCount = Number(ar.reviewCount ?? ar.ratingCount);
  if (!(ratingValue > 0) || !(reviewCount > 0)) return null;
  const reviewRaw = ld?.review;
  const items = (Array.isArray(reviewRaw) ? reviewRaw : reviewRaw ? [reviewRaw] : [])
    .map((r: Json) => ({
      author: typeof r.author === "string" ? r.author : (r.author?.name ?? null),
      rating: r.reviewRating?.ratingValue != null ? Number(r.reviewRating.ratingValue) : null,
      body: String(r.reviewBody ?? r.description ?? "").trim(),
      date: r.datePublished ?? null,
    }))
    .filter((r: { body: string }) => r.body.length > 10)
    .slice(0, 6);
  return { ratingValue, reviewCount, source: "json-ld", items };
}

export function normalizeProductUrl(input: string): { origin: string; handle: string; sourceUrl: string } {
  const url = new URL(input);
  const m = url.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) throw new Error("This does not look like a Shopify product URL (expected /products/<handle>).");
  return { origin: url.origin, handle: decodeURIComponent(m[1]), sourceUrl: `${url.origin}/products/${m[1]}` };
}

export function deriveKeywords(title: string, type: string, tags: string[], vendor: string): string[] {
  const brandWords = new Set(vendor.toLowerCase().split(/\W+/));
  const words = [type, ...tags.slice(0, 8), title]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !brandWords.has(w) && !/^\d+$/.test(w));
  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1));
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 8);
}

export async function extractProduct(inputUrl: string): Promise<{ product: ProductData; html: string; category: string; keywords: string[]; log: string[] }> {
  const log: string[] = [];
  const safe = await assertSafeUrl(inputUrl);
  const { origin, handle, sourceUrl } = normalizeProductUrl(safe.toString());
  const sources: string[] = [];

  const jsRes = await safeFetch(`${origin}/products/${encodeURIComponent(handle)}.js`, { headers: { accept: "application/json" }, maxBytes: 1_500_000 });
  let js: Json;
  try {
    js = JSON.parse(jsRes.text);
  } catch {
    throw new Error(`Could not read ${origin}/products/${handle}.js (HTTP ${jsRes.status}). The product may not be public or the store may not be Shopify.`);
  }
  if (!js?.variants?.length) throw new Error("The Shopify product JSON has no variants.");
  sources.push("products/<handle>.js");
  log.push(`Fetched product JSON (${js.variants.length} variants).`);

  let html = "";
  try {
    const page = await safeFetch(sourceUrl, { maxBytes: 3_500_000 });
    html = page.text;
    log.push(`Fetched product HTML (${Math.round(html.length / 1024)} KB, HTTP ${page.status}).`);
  } catch (e) {
    log.push(`Product HTML unavailable: ${(e as Error).message}`);
  }
  const $ = cheerio.load(html || "<html></html>");

  let ld: Json | undefined;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const nodes = flattenLd(JSON.parse($(el).contents().text()));
      const p = nodes.find((n) => typeOf(n, "Product") || typeOf(n, "ProductGroup"));
      if (p && !ld) ld = p;
    } catch {
      /* ignore invalid JSON-LD */
    }
  });
  if (ld) sources.push("json-ld");
  else log.push("No Product JSON-LD found on the page.");

  const descriptionHtml: string = js.description ?? "";
  const metaDesc = $('meta[name="description"]').attr("content")?.trim() || $('meta[property="og:description"]').attr("content")?.trim() || "";
  const description = stripHtml(descriptionHtml) || (typeof ld?.description === "string" ? ld.description : "") || metaDesc;
  if (!stripHtml(descriptionHtml)) log.push("Product description was empty in Shopify JSON; fell back to structured-data/meta description.");

  const media: Json[] = Array.isArray(js.media) ? js.media.filter((m: Json) => m.media_type === "image") : [];
  const images: ProductImage[] = media.length
    ? media.map((m) => ({ src: normalizeImg(m.src), alt: m.alt ?? null, width: m.width ?? null, height: m.height ?? null }))
    : (js.images ?? []).map((src: string) => ({ src: normalizeImg(src), alt: null, width: null, height: null }));

  const options = (js.options ?? []).map((o: Json, i: number) => ({
    name: String(o.name),
    position: o.position ?? i + 1,
    values: (o.values as string[]) ?? [],
  }));
  const variants = js.variants.map((v: Json) => ({
    id: Number(v.id),
    title: String(v.title),
    price: Number(v.price),
    compareAtPrice: v.compare_at_price && Number(v.compare_at_price) > Number(v.price) ? Number(v.compare_at_price) : null,
    available: !!v.available,
    sku: v.sku ?? null,
    options: [v.option1, v.option2, v.option3].filter((x) => x != null).map(String),
  }));

  let currency: string | null = null;
  const offer = Array.isArray(ld?.offers) ? ld?.offers[0] : ld?.offers ?? ld?.hasVariant?.[0]?.offers;
  currency = offer?.priceCurrency ?? $('meta[property="og:price:currency"]').attr("content") ?? $('meta[itemprop="priceCurrency"]').attr("content") ?? null;
  if (!currency) currency = html.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ?? html.match(/"currency":"([A-Z]{3})"/)?.[1] ?? null;
  if (currency) log.push(`Currency detected: ${currency}.`);
  else log.push("Currency could not be detected from source data; prices render without a currency symbol.");

  const descText = description;
  const specs = extractSpecs($, ld, descriptionHtml);
  const policies = extractPolicies(descText, ld);
  const reviews = extractReviews(ld);
  log.push(reviews ? `Genuine reviews: ${reviews.reviewCount} (rating ${reviews.ratingValue}) from JSON-LD.` : "No genuine review data found in structured data.");
  log.push(`Specs found: ${specs.length}. Verified policy facts: ${policies.length}.`);

  const category = (js.type || (typeof ld?.category === "string" ? ld.category : "") || js.tags?.[0] || "general").toString().trim().toLowerCase().slice(0, 60) || "general";
  const vendor = js.vendor || $('meta[property="og:site_name"]').attr("content") || new URL(origin).hostname;
  const product: ProductData = {
    id: Number(js.id),
    handle,
    title: js.title,
    description,
    descriptionHtml,
    vendor,
    productType: js.type ?? "",
    tags: Array.isArray(js.tags) ? js.tags : String(js.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    currency,
    price: Number(js.price),
    compareAtPrice: js.compare_at_price && Number(js.compare_at_price) > Number(js.price) ? Number(js.compare_at_price) : null,
    available: !!js.available,
    images,
    options,
    variants,
    specs,
    policies,
    reviews,
    seo: {
      title: $("title").first().text().trim() || null,
      description: $('meta[name="description"]').attr("content")?.trim() || null,
      canonical: $('link[rel="canonical"]').attr("href") || null,
    },
    sources,
    origin,
    sourceUrl,
  };
  const keywords = deriveKeywords(product.title, product.productType, product.tags, vendor);
  return { product, html, category, keywords, log };
}

function normalizeImg(src: string) {
  return src.startsWith("//") ? `https:${src}` : src;
}
