import { z } from "zod";
import { aiAvailable, generateJson } from "../ai/adapter";
import type { Archetype, BrandProfileData, ProductData } from "@/shared/types";

export interface CopyBundle {
  eyebrow: string;
  headline: string;
  subhead: string;
  ctaLabel: string;
  storyHeading: string;
  storyParagraphs: string[];
  benefits: Array<{ heading: string; text: string }>;
  faqs: Array<{ question: string; answer: string }>;
  useCases: Array<{ heading: string; text: string }>;
  trust: string[];
  seoTitle: string;
  seoDescription: string;
  shortTitle: string;
}

export function shortTitle(title: string): string {
  const t = title.split(/\s[|–—]\s|\s-\s|\(|,/)[0].trim();
  return (t.length > 3 ? t : title).slice(0, 64);
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 260);
}

function clip(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

function listItems(html: string): string[] {
  const out: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (t.length > 8 && t.length < 200) out.push(t);
  }
  return out;
}

function splitHeading(item: string): { heading: string; text: string } {
  const m = item.match(/^([^:–—-]{3,40})\s*[:–—-]\s+(.+)$/);
  if (m) return { heading: m[1].trim(), text: m[2].trim() };
  const words = item.split(" ");
  return { heading: words.slice(0, 4).join(" ").replace(/[,.;]$/, ""), text: item };
}

export function formatMoney(minor: number, currency: string | null): string {
  const amount = minor / 100;
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Deterministic, facts-only copy composer. Never adds claims that are not present in product data. */
export function composeRuleCopy(p: ProductData, brand: BrandProfileData, archetype: Archetype, variantSeed: number): CopyBundle {
  const short = shortTitle(p.title);
  const sents = sentences(p.description);
  const items = listItems(p.descriptionHtml);
  const rawBenefits = (items.length >= 2 ? items : sents.slice(1)).slice(0, 6);
  const benefits = rawBenefits.map((b) => {
    const s = splitHeading(b);
    return { heading: clip(s.heading, 40), text: clip(s.text, 180) };
  });
  const lead = sents[0] ?? clip(p.description, 180);
  const pct = p.compareAtPrice ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0;

  const headlines: Record<Archetype, string[]> = {
    story: [`Meet ${short}`, `The story behind ${short}`, `${short}, up close`],
    benefit: [`${short}: what you get`, `Why choose ${short}`, `${short} at a glance`],
    proof: p.reviews
      ? [`Rated ${p.reviews.ratingValue}/5 across ${p.reviews.reviewCount} reviews`, `${short} — see what buyers say`]
      : [`See ${short} up close`, `${short}, shown in detail`],
    offer: pct >= 5 ? [`Save ${pct}% on ${short}`, `${short}: ${pct}% below list price`] : [`${short} — ${formatMoney(p.price, p.currency)}`, `Get ${short} today`],
  };
  const eyebrows: Record<Archetype, string> = {
    story: brand.name,
    benefit: p.productType || brand.name,
    proof: p.reviews ? `${p.reviews.reviewCount} reviews` : brand.name,
    offer: pct >= 5 ? "Current price" : brand.name,
  };

  const faqs: CopyBundle["faqs"] = [];
  if (lead) faqs.push({ question: `What is ${short}?`, answer: lead });
  if (p.options.length) {
    faqs.push({
      question: `What options does ${short} come in?`,
      answer: `${short} is available in these options — ${p.options.map((o) => `${o.name}: ${o.values.join(", ")}`).join("; ")}.`,
    });
  }
  const pkg = p.specs.find((s) => /box|content|includes|package|in the/i.test(s.label));
  if (pkg) faqs.push({ question: `What is included with ${short}?`, answer: `${pkg.label}: ${pkg.value}.` });
  p.specs.filter((s) => s !== pkg).slice(0, archetype === "benefit" ? 3 : 1).forEach((s) =>
    faqs.push({ question: `What is the ${s.label.toLowerCase()} of ${short}?`, answer: `The ${s.label.toLowerCase()} of ${short} is ${s.value}.` }),
  );
  for (const pol of p.policies.slice(0, archetype === "benefit" ? 3 : 2)) {
    faqs.push({ question: `What does the product information say about ${pol.label.toLowerCase()}?`, answer: pol.value });
  }
  faqs.push({ question: `Who sells ${short}?`, answer: `${short} is sold by ${p.vendor}.` });

  const useCases = sents
    .filter((s) => /\b(ideal|perfect|designed|great|suitable) for\b/i.test(s))
    .slice(0, 3)
    .map((s) => ({ heading: "Who it is for", text: clip(s, 200) }));

  const trust = p.policies.filter((x) => ["cod", "free_shipping", "returns", "warranty", "guarantee"].includes(x.key)).map((x) => x.label);
  if (p.reviews) trust.unshift(`${p.reviews.ratingValue}/5 from ${p.reviews.reviewCount} reviews`);

  const storyParas = sents.slice(0, 3 + (variantSeed % 2));
  return {
    eyebrow: eyebrows[archetype],
    headline: headlines[archetype][variantSeed % headlines[archetype].length],
    subhead: clip(lead, 190),
    ctaLabel: "Add to cart",
    storyHeading: archetype === "story" ? `Why ${short} exists` : `About ${short}`,
    storyParagraphs: storyParas.length ? storyParas : [clip(p.description, 400)].filter(Boolean),
    benefits,
    faqs: faqs.slice(0, archetype === "benefit" ? 7 : 5),
    useCases,
    trust,
    seoTitle: clip(`${short} | ${p.vendor}`, 60),
    seoDescription: clip(lead || p.description || `${short} by ${p.vendor}.${p.options.length ? ` Available in ${p.options.map((o) => `${o.name.toLowerCase()}: ${o.values.slice(0, 4).join(", ")}`).join("; ")}.` : ""} Buy online.`, 155),
    shortTitle: short,
  };
}

const aiSchema = z.object({
  headline: z.string().min(3).max(90),
  subhead: z.string().min(10).max(220),
  eyebrow: z.string().max(40),
  storyHeading: z.string().max(80),
  storyParagraphs: z.array(z.string().max(420)).min(1).max(4),
  benefits: z.array(z.object({ heading: z.string().max(40), text: z.string().max(200) })).max(6),
});

const BANNED = /\b(guarantee[d]?|clinically|#1|best[- ]selling|award[- ]winning|doctor|scientifically|lifetime|certified|100%)\b/i;

function factText(p: ProductData): string {
  return [p.title, p.description, p.vendor, p.tags.join(" "), p.specs.map((s) => `${s.label} ${s.value}`).join(" "), p.options.map((o) => o.values.join(" ")).join(" "), String(p.price / 100)].join(" ").toLowerCase();
}

function guard(p: ProductData, c: z.infer<typeof aiSchema>): string | null {
  const facts = factText(p);
  const all = JSON.stringify(c);
  const nums = all.match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const n of nums) if (!facts.includes(n.toLowerCase())) return `number "${n}" is not supported by product facts`;
  const banned = all.match(BANNED);
  if (banned && !facts.includes(banned[0].toLowerCase())) return `unsupported claim word "${banned[0]}"`;
  return null;
}

export async function buildCopy(
  p: ProductData,
  brand: BrandProfileData,
  archetype: Archetype,
  seed: number,
): Promise<{ copy: CopyBundle; source: "ai" | "rules"; warnings: string[] }> {
  const base = composeRuleCopy(p, brand, archetype, seed);
  const warnings: string[] = [];
  if (!aiAvailable()) return { copy: base, source: "rules", warnings };
  const angle: Record<Archetype, string> = {
    story: "an emotional, editorial brand story",
    benefit: "a bold benefit-first value proposition",
    proof: "an evidence/social-proof-led framing (do not mention reviews unless provided in facts)",
    offer: "a clear, factual offer/price-led framing",
  };
  try {
    const facts = {
      title: p.title, vendor: p.vendor, type: p.productType, description: p.description.slice(0, 1800),
      options: p.options, specs: p.specs.map((s) => ({ [s.label]: s.value })), tone: brand.tone,
      policies: p.policies.map((x) => x.value), reviews: p.reviews ? { rating: p.reviews.ratingValue, count: p.reviews.reviewCount } : null,
    };
    const out = await generateJson(
      aiSchema,
      "You write original e-commerce landing page copy. Use ONLY the supplied facts. Never invent numbers, awards, guarantees, certifications, medical claims, reviews or delivery promises. Match the brand tone. Return JSON: {headline, subhead, eyebrow, storyHeading, storyParagraphs[], benefits[{heading,text}]}.",
      `Write copy for ${angle[archetype]}. Facts: ${JSON.stringify(facts)}`,
    );
    const violation = guard(p, out);
    if (violation) throw new Error(`claim guard rejected AI copy: ${violation}`);
    return { copy: { ...base, ...out, benefits: out.benefits.length ? out.benefits : base.benefits }, source: "ai", warnings };
  } catch (e) {
    warnings.push(`AI copy unavailable (${(e as Error).message.slice(0, 140)}); used facts-only rule-based copy.`);
    return { copy: base, source: "rules", warnings };
  }
}
