import * as cheerio from "cheerio";
import { safeFetch, politeDelay } from "../safe-fetch";
import { withPage, saveShot } from "../browser";

export interface RobotsDecision {
  allowed: boolean;
  reason: string;
}

function robotsMatch(path: string, pattern: string): boolean {
  if (!pattern) return false;
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

export async function checkRobots(url: string): Promise<RobotsDecision> {
  const u = new URL(url);
  try {
    const r = await safeFetch(`${u.origin}/robots.txt`, { timeoutMs: 7000, maxBytes: 300_000 });
    if (r.status >= 400) return { allowed: true, reason: `robots.txt not available (HTTP ${r.status}); no restrictions declared` };
    const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
    let cur: (typeof groups)[number] | null = null;
    let lastWasAgent = false;
    for (const rawLine of r.text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*/, "").trim();
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const k = m[1].toLowerCase();
      if (k === "user-agent") {
        if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
        cur.agents.push(m[2].trim().toLowerCase());
        lastWasAgent = true;
      } else if ((k === "allow" || k === "disallow") && cur) {
        cur.rules.push({ allow: k === "allow", path: m[2].trim() });
        lastWasAgent = false;
      } else lastWasAgent = false;
    }
    const mine = groups.find((g) => g.agents.some((a) => a !== "*" && "wishluckstudiobot".includes(a))) ?? groups.find((g) => g.agents.includes("*"));
    if (!mine) return { allowed: true, reason: "robots.txt has no applicable group" };
    const target = u.pathname + u.search;
    let best: { allow: boolean; len: number } | null = null;
    for (const rule of mine.rules) {
      if (rule.path && robotsMatch(target, rule.path)) {
        const len = rule.path.length;
        if (!best || len > best.len || (len === best.len && rule.allow)) best = { allow: rule.allow, len };
      }
    }
    if (best && !best.allow) return { allowed: false, reason: "Disallowed by robots.txt" };
    return { allowed: true, reason: "Allowed by robots.txt" };
  } catch (e) {
    return { allowed: true, reason: `robots.txt unreachable (${(e as Error).message.slice(0, 60)}); proceeding politely` };
  }
}

const SECTION_RULES: Array<[string, RegExp]> = [
  ["reviews", /review|testimonial|rating|judge|yotpo|loox|stamped|okendo|customer-say/i],
  ["faq", /faq|accordion|collaps|question/i],
  ["comparison", /compar|versus|\bvs\b/i],
  ["specs", /spec|ingredient|technical|tech-detail|nutrition/i],
  ["benefits", /benefit|feature|why-|highlight|icon-with-text|multicolumn|multi-column|usp|advantage/i],
  ["video", /video|youtube|vimeo/i],
  ["gallery", /gallery|lookbook|instagram|ugc/i],
  ["related", /recommend|related|you-may|also-like|featured-collection|product-grid|collection-list/i],
  ["trust", /trust|badge|guarantee|payment|shipping|assurance/i],
  ["story", /story|about|founder|rich-text|image-with-text|brand|mission/i],
  ["newsletter", /newsletter|subscribe|email-signup/i],
  ["banner", /hero|banner|slideshow|image-banner|masthead/i],
];

export interface Observation {
  title: string | null;
  sectionOrder: string[];
  sectionCount: number;
  heroStyle: string;
  headline: { wordCount: number; strategy: string } | null;
  offer: { compareAtShown: boolean; discountBadge: boolean; emiOrBnpl: boolean; bundleLanguage: boolean };
  cta: { count: number; firstPositionPct: number | null; likelyAboveFold: boolean; stickyAtc: boolean };
  trustSignals: string[];
  reviews: { widgetDetected: boolean; app: string | null; nearPricing: boolean; sectionPresent: boolean };
  media: { images: number; videos: number };
  faq: { present: boolean; positionPct: number | null; detailsCount: number };
  mobile: { viewportMeta: boolean; stickyAtc: boolean; whatsapp: boolean; codOrUpi: boolean };
  usp: string[];
  limitations: string[];
}

export function analyzeHtml(html: string): Observation {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").not('[type="application/ld+json"]').remove();
  const text = $("body").text().replace(/\s+/g, " ").toLowerCase();
  const limitations: string[] = [];
  const root = $("main, #MainContent, [role=main]").first().length ? $("main, #MainContent, [role=main]").first() : $("body");
  let sections = root.find(".shopify-section, section").filter((_, el) => $(el).parents(".shopify-section, section").length === 0).toArray();
  if (sections.length < 2) sections = root.children().toArray();
  const order: string[] = [];
  const labels: string[] = [];
  sections.forEach((el) => {
    const $el = $(el);
    const sig = `${$el.attr("id") ?? ""} ${$el.attr("class") ?? ""} ${$el.find("h2,h3").first().text()}`;
    let label = "content";
    if ($el.find('form[action*="/cart/add"]').length || /product-(info|form|main)|main-product/i.test(sig)) label = "product";
    else for (const [l, re] of SECTION_RULES) if (re.test(sig)) { label = l; break; }
    labels.push(label);
  });
  labels.forEach((l) => { if (order[order.length - 1] !== l) order.push(l); });
  if (!order.length) limitations.push("No discernible page sections in static HTML.");

  const all = $("*").toArray();
  const total = all.length || 1;
  const idxOf = (el: unknown) => all.indexOf(el as never);

  const h1 = $("h1").first().text().trim();
  let headline: Observation["headline"] = null;
  if (h1) {
    const wc = h1.split(/\s+/).length;
    const strategy = /\d/.test(h1) ? "number/spec-led" : /\?/.test(h1) ? "question" : /\b(for|with|without|to|that)\b/i.test(h1) && wc >= 5 ? "benefit-led" : wc <= 4 ? "short name-led" : "descriptive product name";
    headline = { wordCount: wc, strategy };
  }

  const ctaEls = $('button[name="add"], form[action*="/cart/add"] [type="submit"], [class*="add-to-cart" i], [class*="addtocart" i], button').filter((_, el) => /add to (cart|bag)|buy now|add to basket|buy it now/i.test($(el).text()) || $(el).is('button[name="add"]') || /add-to-cart|addtocart/i.test($(el).attr("class") ?? "")).toArray();
  const firstCta = ctaEls[0] ? idxOf(ctaEls[0]) : -1;
  const stickyAtc = /sticky[-_ ]?(atc|add|cart|bar|buy)|atc[-_]?(sticky|bar)|product-sticky|sticky-product|fixed-cta/i.test(html);

  const priceEl = $('[class*="price" i]').first().get(0);
  const ratingEls = $('[class*="rating" i], [class*="review" i], [class*="star" i], .jdgm-prev-badge, [itemprop="aggregateRating"], [class*="stamped" i], [class*="loox" i]').toArray();
  const priceIdx = priceEl ? idxOf(priceEl) : -1;
  const nearPricing = priceIdx >= 0 && ratingEls.some((r) => Math.abs(idxOf(r) - priceIdx) <= 45);
  const reviewApp = /jdgm|judge\.me/i.test(html) ? "Judge.me" : /yotpo/i.test(html) ? "Yotpo" : /loox/i.test(html) ? "Loox" : /stamped/i.test(html) ? "Stamped" : /okendo/i.test(html) ? "Okendo" : /trustpilot/i.test(html) ? "Trustpilot" : null;

  const trustRules: Array<[string, RegExp]> = [
    ["cash on delivery", /cash on delivery|\bcod\b/],
    ["free shipping", /free (shipping|delivery)/],
    ["returns / replacement", /easy returns?|\d+[- ]day (return|replacement)|return policy/],
    ["warranty", /warranty/],
    ["secure payment", /secure (payment|checkout)|100% secure|ssl/],
    ["money-back guarantee", /money[- ]back|guarantee/],
    ["certifications", /certified|iso \d|fda|bis |dermatolog/],
  ];
  const trustSignals = trustRules.filter(([, re]) => re.test(text)).map(([l]) => l);

  const faqIdx = labels.indexOf("faq");
  const hero = sections[0] ? $(sections[0]) : null;
  const productFirst = sections.slice(0, 2).some((s) => $(s).find('form[action*="/cart/add"]').length > 0);
  const heroVideo = hero ? hero.find("video, iframe[src*=youtube], iframe[src*=vimeo]").length > 0 : false;
  const heroStyle = productFirst ? "product-first split (gallery + buy box)" : heroVideo ? "video-led banner" : "banner-first (image/headline above product)";

  const usp: string[] = [];
  if (/\bsave\b|% off|discount/.test(text)) usp.push("price/offer-led");
  if (/ingredient|formulated|made (with|from)/.test(text)) usp.push("ingredient/material-led");
  if (/our story|founder|handcrafted|made in india|since \d{4}/.test(text)) usp.push("brand-story-led");
  if ((text.match(/\b\d+\s?(mah|hours?|hrs|gb|mm|cm|kg|g|ml|w|watt|db)\b/g) ?? []).length > 5) usp.push("spec-led");
  if (ratingEls.length) usp.push("social-proof-led");
  if (/eco|sustainab|recycl|vegan|cruelty/.test(text)) usp.push("sustainability-led");

  if (!ctaEls.length) limitations.push("No add-to-cart control detected in static HTML (may be a collection/home page or JS-rendered).");

  return {
    title: $("title").first().text().trim() || null,
    sectionOrder: order.slice(0, 14),
    sectionCount: sections.length,
    heroStyle,
    headline,
    offer: {
      compareAtShown: $("s, del, [class*=compare i], [class*=was-price i], [class*=old-price i], [class*=price--sale i]").length > 0,
      discountBadge: /\d+%\s*off|save\s*(rs\.?|₹|\$)?\s*[\d,]+/.test(text),
      emiOrBnpl: /\bemi\b|no[- ]cost|pay later|snapmint|simpl\b|zestmoney|klarna|afterpay|buy now pay later/.test(text),
      bundleLanguage: /bundle|buy \d+ get|combo|b1g1|buy 1 get/.test(text),
    },
    cta: { count: ctaEls.length, firstPositionPct: firstCta >= 0 ? Math.round((firstCta / total) * 100) : null, likelyAboveFold: firstCta >= 0 && firstCta / total < 0.3, stickyAtc },
    trustSignals,
    reviews: { widgetDetected: ratingEls.length > 0 || !!reviewApp, app: reviewApp, nearPricing, sectionPresent: labels.includes("reviews") },
    media: { images: root.find("img").length, videos: root.find("video, iframe[src*=youtube], iframe[src*=vimeo]").length },
    faq: { present: faqIdx >= 0 || $("details").length > 2, positionPct: faqIdx >= 0 ? Math.round((faqIdx / Math.max(1, labels.length - 1)) * 100) : null, detailsCount: $("details").length },
    mobile: {
      viewportMeta: $('meta[name="viewport"]').length > 0,
      stickyAtc,
      whatsapp: /wa\.me|whatsapp/i.test(html),
      codOrUpi: /\bupi\b|cash on delivery|\bcod\b|gpay|phonepe|paytm/.test(text),
    },
    usp,
    limitations,
  };
}

export interface CrawlOutcome {
  status: "crawled" | "blocked_by_robots" | "failed";
  reason?: string;
  title?: string | null;
  observation?: Observation;
  screenshots: { desktop?: string; mobile?: string };
}

export async function crawlCompetitor(url: string, shotKey: string): Promise<CrawlOutcome> {
  const domain = new URL(url).hostname;
  await politeDelay(domain);
  const robots = await checkRobots(url);
  if (!robots.allowed) return { status: "blocked_by_robots", reason: robots.reason, screenshots: {} };
  try {
    const res = await safeFetch(url, { timeoutMs: 15000, maxBytes: 3_000_000 });
    if (res.status >= 400) return { status: "failed", reason: `HTTP ${res.status}`, screenshots: {} };
    if (!/html/i.test(res.contentType)) return { status: "failed", reason: `Unexpected content type ${res.contentType}`, screenshots: {} };
    const observation = analyzeHtml(res.text);
    const screenshots: CrawlOutcome["screenshots"] = {};
    try {
      screenshots.desktop = (await withPage(url, {}, async ({ page }) => saveShot(page, `${shotKey}-desktop`))) ?? undefined;
      screenshots.mobile = (await withPage(url, { mobile: true }, async ({ page }) => saveShot(page, `${shotKey}-mobile`))) ?? undefined;
    } catch (e) {
      observation.limitations.push(`Screenshot failed: ${(e as Error).message.split("\n")[0]}`);
    }
    if (!screenshots.desktop) observation.limitations.push("Screenshots unavailable (browser not available or page blocked rendering).");
    return { status: "crawled", title: observation.title, observation, screenshots };
  } catch (e) {
    return { status: "failed", reason: (e as Error).message.slice(0, 160), screenshots: {} };
  }
}

export interface InsightInput {
  url: string;
  obs: Observation;
}

export interface Insight {
  key: string;
  statement: string;
  supporting: number;
  sampleSize: number;
  evidenceUrls: string[];
}

export function computeInsights(items: InsightInput[]): Insight[] {
  const n = items.length;
  if (!n) return [];
  const rules: Array<[string, string, (o: Observation) => boolean]> = [
    ["social_proof_near_price", "display social proof (ratings/reviews) near pricing", (o) => o.reviews.nearPricing],
    ["review_widget", "include a review widget or rating element", (o) => o.reviews.widgetDetected],
    ["dedicated_reviews_section", "have a dedicated reviews/testimonials section", (o) => o.reviews.sectionPresent],
    ["sticky_atc", "use a sticky add-to-cart pattern", (o) => o.cta.stickyAtc],
    ["cta_early", "place the first add-to-cart control early in the document (likely above the fold)", (o) => o.cta.likelyAboveFold],
    ["faq_present", "include an FAQ/accordion block", (o) => o.faq.present],
    ["video_present", "include product video or embedded video", (o) => o.media.videos > 0],
    ["compare_at", "show a compare-at / strikethrough price", (o) => o.offer.compareAtShown],
    ["discount_badge", "show a discount or savings message", (o) => o.offer.discountBadge],
    ["emi_bnpl", "mention EMI / pay-later options", (o) => o.offer.emiOrBnpl],
    ["bundle", "use bundle/combo language", (o) => o.offer.bundleLanguage],
    ["trust_multi", "show two or more trust signals (returns, COD, warranty, shipping…)", (o) => o.trustSignals.length >= 2],
    ["cod_upi_mobile", "mention COD/UPI payment options (mobile conversion aid)", (o) => o.mobile.codOrUpi],
    ["product_first_hero", "open with a product-first split hero (gallery + buy box)", (o) => o.heroStyle.startsWith("product-first")],
    ["spec_led_usp", "lean on spec-led messaging", (o) => o.usp.includes("spec-led")],
    ["story_usp", "lean on brand-story messaging", (o) => o.usp.includes("brand-story-led")],
  ];
  const out: Insight[] = [];
  for (const [key, text, fn] of rules) {
    const matches = items.filter((i) => fn(i.obs));
    out.push({
      key,
      statement: `${matches.length} of ${n} successfully analyzed pages ${text}.`,
      supporting: matches.length,
      sampleSize: n,
      evidenceUrls: matches.map((m) => m.url),
    });
  }
  // most common section at position 2 (after product)
  const secondCounts = new Map<string, string[]>();
  items.forEach((i) => {
    const idx = i.obs.sectionOrder.indexOf("product");
    const next = i.obs.sectionOrder[(idx >= 0 ? idx : 0) + 1];
    if (next) secondCounts.set(next, [...(secondCounts.get(next) ?? []), i.url]);
  });
  const top = [...secondCounts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (top) out.push({ key: "section_after_product", statement: `${top[1].length} of ${n} successfully analyzed pages place a "${top[0]}" section directly after the product block.`, supporting: top[1].length, sampleSize: n, evidenceUrls: top[1] });
  return out.sort((a, b) => b.supporting - a.supporting);
}
