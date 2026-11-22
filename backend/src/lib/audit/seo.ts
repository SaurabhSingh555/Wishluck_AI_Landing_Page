import * as cheerio from "cheerio";
import type { AuditItem, ProductData, SeoAuditResult } from "@/shared/types";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function words(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function score(items: AuditItem[], group: string) {
  const g = items.filter((i) => i.group === group && i.status !== "na");
  if (!g.length) return 100;
  const pts = g.reduce((s, i) => s + (i.status === "pass" ? 1 : i.status === "warn" ? 0.5 : 0), 0);
  return Math.round((pts / g.length) * 100);
}

/** Rule-based, explainable SEO/AEO/GEO audit of the rendered preview HTML against the verified product facts. */
export function auditHtml(html: string, product: ProductData, shortTitle: string): SeoAuditResult {
  const $ = cheerio.load(html);
  const items: AuditItem[] = [];
  const add = (group: AuditItem["group"], id: string, title: string, status: AuditItem["status"], detail: string) => items.push({ id, group, title, status, detail });

  // ---- structured data ----
  const blocks: Json[] = [];
  const sdErrors: string[] = [];
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      blocks.push(JSON.parse($(el).contents().text()));
    } catch (e) {
      sdErrors.push(`JSON-LD block ${i + 1} is not valid JSON: ${(e as Error).message}`);
    }
  });
  const types = blocks.map((b) => String(b["@type"]));
  const productLd = blocks.find((b) => b["@type"] === "Product");
  const faqLd = blocks.find((b) => b["@type"] === "FAQPage");

  $("script,style,noscript").remove();
  // ---- SEO ----
  const h1s = $("h1").length;
  add("SEO", "h1", "Exactly one H1", h1s === 1 ? "pass" : "fail", `Found ${h1s} H1 element(s).`);
  const levels = $("h1,h2,h3,h4").map((_, e) => Number(e.tagName[1])).get();
  const skipped = levels.some((l, i) => i > 0 && l - levels[i - 1] > 1);
  add("SEO", "heading-order", "Logical heading hierarchy", skipped ? "warn" : "pass", skipped ? "A heading level is skipped (e.g. H1 → H3)." : "Headings descend without skipping levels.");
  const title = $("title").text().trim();
  add("SEO", "title", "SEO title present (10–65 chars)", title.length >= 10 && title.length <= 65 ? "pass" : title ? "warn" : "fail", `Title length ${title.length}. Edit in Shopify: product → Search engine listing.`);
  const desc = $('meta[name="description"]').attr("content")?.trim() ?? "";
  add("SEO", "meta-desc", "Meta description (70–160 chars)", desc.length >= 70 && desc.length <= 160 ? "pass" : desc ? "warn" : "fail", `Description length ${desc.length}.`);
  const canon = $('link[rel="canonical"]').length;
  add("SEO", "canonical", "Single canonical tag", canon === 1 ? "pass" : "fail", `Found ${canon} canonical link(s). In Shopify the theme layout emits it; sections never add one.`);
  const imgs = $("img").toArray();
  const noAlt = imgs.filter((i) => $(i).attr("alt") === undefined).length;
  add("SEO", "img-alt", "All images have alt attributes", noAlt === 0 ? "pass" : "fail", `${imgs.length - noAlt}/${imgs.length} images declare alt text.`);
  const emptyAlt = imgs.filter((i) => ($(i).attr("alt") ?? "x") === "" && !$(i).closest("button").length).length;
  add("SEO", "img-alt-desc", "Content images have descriptive alt text", emptyAlt === 0 ? "pass" : "warn", `${emptyAlt} non-decorative image(s) with empty alt.`);
  const lazy = imgs.slice(1).filter((i) => $(i).attr("loading") !== "lazy").length;
  add("SEO", "lazy", "Below-the-fold images are lazy-loaded", lazy === 0 ? "pass" : "warn", `${lazy} image(s) after the first are not lazy.`);
  add("SEO", "responsive-img", "Responsive images (srcset + sizes) on main images", imgs.filter((i) => $(i).attr("srcset")).length >= Math.min(2, imgs.length) ? "pass" : "warn", `${imgs.filter((i) => $(i).attr("srcset")).length} image(s) with srcset.`);
  const internal = $('a[href*="/collections/"]').length;
  add("SEO", "internal-links", "Internal collection/product links", internal > 0 ? "pass" : "warn", `${internal} collection link(s).`);
  add("SEO", "handle", "Readable URL handle", /^[a-z0-9-]{3,80}$/.test(product.handle) ? "pass" : "warn", `Handle: ${product.handle}`);
  add("SEO", "viewport", "Responsive viewport meta tag", $('meta[name="viewport"]').length ? "pass" : "fail", "");

  let pOk = false;
  let pDetail = "No Product JSON-LD block found.";
  if (productLd) {
    const offers: Json[] = Array.isArray(productLd.offers) ? productLd.offers : productLd.offers ? [productLd.offers] : [];
    const missing: string[] = [];
    if (!productLd.name) missing.push("name");
    if (!productLd.image?.length) missing.push("image");
    if (!productLd.brand?.name) missing.push("brand");
    if (!offers.length) missing.push("offers");
    offers.forEach((o, i) => {
      if (o.price === undefined || o.price === null) missing.push(`offers[${i}].price`);
      if (!o.priceCurrency) missing.push(`offers[${i}].priceCurrency`);
      if (!/schema\.org\/(InStock|OutOfStock|PreOrder|BackOrder|SoldOut)/.test(o.availability ?? "")) missing.push(`offers[${i}].availability`);
    });
    pOk = missing.length === 0;
    pDetail = pOk ? `Product with ${offers.length} offer(s), ${productLd.image.length} image(s), brand ${productLd.brand.name}.` : `Missing: ${[...new Set(missing)].slice(0, 6).join(", ")}${!product.currency ? " (currency is resolved from the store at render time; preview uses the detected source currency)" : ""}`;
  }
  add("SEO", "jsonld-product", "Product JSON-LD with name, images, brand, price, currency, availability", pOk ? "pass" : "fail", pDetail);
  const hasAR = !!productLd?.aggregateRating;
  const realReviews = !!product.reviews;
  add("SEO", "aggregate-rating", "AggregateRating only when real review data exists", hasAR === realReviews || (!hasAR && realReviews) ? "pass" : "fail", hasAR ? "AggregateRating present and backed by source structured data." : realReviews ? "Source has reviews but they are not emitted (marketer can add via Structured data section)." : "No reviews in source, none emitted.");
  add("SEO", "jsonld-valid", "All JSON-LD blocks parse as valid JSON", sdErrors.length ? "fail" : "pass", sdErrors[0] ?? `${blocks.length} block(s) parsed: ${types.join(", ")}.`);

  // ---- AEO ----
  const faqItems = $(".wl-faq details");
  const faqCount = faqItems.length;
  add("AEO", "faq-present", "Product-specific FAQ section (≥3 questions)", faqCount >= 3 ? "pass" : faqCount > 0 ? "warn" : "fail", `${faqCount} question(s) rendered.`);
  let faqValid = false;
  if (faqLd) faqValid = Array.isArray(faqLd.mainEntity) && faqLd.mainEntity.length === faqCount && faqLd.mainEntity.every((q: Json) => q["@type"] === "Question" && q.acceptedAnswer?.text);
  add("AEO", "faq-jsonld", "FAQPage JSON-LD matches visible FAQ", faqCount === 0 ? "na" : faqValid ? "pass" : "fail", faqValid ? "mainEntity count equals visible questions; every Question has acceptedAnswer.text. (Rich-result eligibility is decided by Google and is not promised.)" : "FAQPage block missing or mismatched with visible content.");
  const answers = faqItems.map((_, e) => $(e).find(".wl-faq__a").text()).get();
  const bad = answers.filter((a) => words(a) < 4 || words(a) > 80).length;
  add("AEO", "faq-concise", "Answers are concise (4–80 words) and self-contained", faqCount === 0 ? "na" : bad === 0 ? "pass" : "warn", `${bad} answer(s) outside the range.`);
  const qs = faqItems.map((_, e) => $(e).find("summary").text()).get();
  const named = qs.filter((q) => q.toLowerCase().includes(shortTitle.toLowerCase().slice(0, 14))).length;
  add("AEO", "faq-specific", "Questions reference the product by name", faqCount === 0 ? "na" : named / faqCount >= 0.5 ? "pass" : "warn", `${named}/${faqCount} questions name the product.`);

  // ---- GEO ----
  const specRows = $(".wl-s--specs tr, .wl-s--specs .wl-card").length;
  add("GEO", "specs", "Explicit factual specification list", product.specs.length === 0 ? "na" : specRows >= 3 ? "pass" : specRows > 0 ? "warn" : "fail", product.specs.length === 0 ? "No specifications exist in the source product data; none are invented." : `${specRows} specification row(s) rendered (${product.specs.length} available in source data).`);
  const specLabels = product.specs.map((s) => s.label.toLowerCase()).join(" ");
  const hasMat = /material|fabric|ingredient|composition/.test(specLabels);
  const hasDim = /dimension|size|weight|length|width|height|capacity|volume/.test(specLabels);
  add("GEO", "materials", "Materials stated", hasMat ? "pass" : "na", hasMat ? "Material/ingredient spec present." : "Not available in source data — intentionally not invented.");
  add("GEO", "dimensions", "Dimensions / size / weight stated", hasDim ? "pass" : "na", hasDim ? "Dimension-type spec present." : "Not available in source data — intentionally not invented.");
  const hasPkg = /box|content|includes|package/.test(specLabels);
  add("GEO", "package", "Package contents stated", hasPkg ? "pass" : "na", hasPkg ? "Package contents present." : "Not available in source data.");
  const uc = $(".wl-s--usecases").length > 0;
  add("GEO", "use-cases", "Use cases / who it is for", uc ? "pass" : "na", uc ? "Use-case section present." : "No explicit audience statements in source data; section omitted rather than invented.");
  const text = $("body").text().toLowerCase();
  const spots = [$("h1").text(), title, qs.join(" "), JSON.stringify(productLd ?? {})].filter((t) => t.toLowerCase().includes(shortTitle.toLowerCase().slice(0, 14))).length;
  add("GEO", "terminology", "Consistent product name across H1/title/FAQ/JSON-LD", spots >= 3 ? "pass" : "warn", `Product name found in ${spots}/4 key places.`);
  const offerCount = Array.isArray(productLd?.offers) ? productLd!.offers.length : 0;
  add("GEO", "machine-facts", "One Offer per variant in structured data", offerCount === product.variants.length ? "pass" : "warn", `${offerCount} offers vs ${product.variants.length} variants.`);
  add("GEO", "brand", "Brand named in page and structured data", text.includes(product.vendor.toLowerCase()) && productLd?.brand?.name ? "pass" : "warn", `Brand: ${product.vendor}`);
  const sourceText = `${product.description} ${product.title}`.toLowerCase();
  const claimRe = /(guarantee[d]?|#1|best[- ]selling|clinically|award[- ]winning|lifetime warranty|doctor recommended)/g;
  const claims = [...new Set(text.match(claimRe) ?? [])].filter((c) => !sourceText.includes(c));
  add("GEO", "no-claims", "No unsupported claims (guarantee, #1, clinical…)", claims.length ? "fail" : "pass", claims.length ? `Unsupported: ${claims.join(", ")}` : "No unverified superlatives or guarantees found.");
  const policyChecks: Array<[string, RegExp, string]> = [["COD", /cash on delivery|\bcod\b/, "cod"], ["Free shipping", /free (shipping|delivery)/, "free_shipping"], ["Returns", /\d+[- ]day (return|replacement)|easy returns?/, "returns"]];
  const unverified = policyChecks.filter(([, re, key]) => re.test(text) && !product.policies.some((p) => p.key === key)).map(([n]) => n);
  add("GEO", "verified-policies", "Delivery/COD/returns claims only when in source data", unverified.length ? "fail" : "pass", unverified.length ? `Unverified: ${unverified.join(", ")}` : `${product.policies.length} verified policy fact(s) available; no unverified policy claims rendered.`);

  const scores = { seo: score(items, "SEO"), aeo: score(items, "AEO"), geo: score(items, "GEO"), overall: 0 };
  scores.overall = Math.round((scores.seo + scores.aeo + scores.geo) / 3);
  return { scores, items, structuredData: { blocks: blocks.length, types, errors: sdErrors } };
}
