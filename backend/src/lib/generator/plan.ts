import type { Archetype } from "@/shared/types";

export type SectionKind = "hero" | "story" | "benefits" | "gallery" | "specs" | "reviews" | "faq" | "cta" | "trust" | "comparison" | "usecases" | "offer";
export type Scheme = "light" | "tint" | "dark" | "accent";

export interface SectionPlan {
  kind: SectionKind;
  layout: string;
  scheme: Scheme;
}

export interface DesignPlan {
  archetype: Archetype;
  recipeId: string;
  sections: SectionPlan[];
  hero: { layout: string; mediaPosition: "left" | "right" | "top" | "background"; align: "left" | "center"; density: "low" | "medium" | "high" };
  galleryStyle: "thumbs-left" | "thumbs-below" | "stacked" | "single-hero";
  cta: { shape: "pill" | "rounded" | "square"; width: "full" | "auto"; label: string; secondaryPositions: string[] };
  trustPlacement: "hero" | "under-buybox" | "mid" | "footer" | "none";
  offerPlacement: "hero-price" | "banner" | "dedicated-section" | "none";
  typography: { h1Scale: number; headingCase: "none" | "uppercase"; headingWeight: number; bodyScale: number };
  spacing: "compact" | "regular" | "airy";
  colorMode: "light" | "tint" | "dark";
}

export interface PlanContext {
  hasReviews: boolean;
  hasSpecs: boolean;
  hasBenefits: boolean;
  hasMultiVariants: boolean;
  hasUseCases: boolean;
  hasTrust: boolean;
  hasStory: boolean;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  story: "Design A — Story-led",
  benefit: "Design B — Benefit-first",
  proof: "Design C — Social-proof-led",
  offer: "Design D — Offer-led",
};

export const HERO_LAYOUTS: Record<Archetype, string[]> = {
  story: ["split-editorial", "overlay-card", "masthead-stack"],
  benefit: ["headline-chips-right", "centered-chips", "compact-left-gallery"],
  proof: ["rating-banner", "mosaic-proof", "split-proof-strip"],
  offer: ["price-badge-split", "top-banner-center", "price-card-stack"],
};

const RECIPES: Record<Archetype, SectionKind[][]> = {
  story: [
    ["hero", "story", "benefits", "gallery", "specs", "reviews", "faq", "cta"],
    ["hero", "benefits", "story", "reviews", "usecases", "faq", "specs", "cta"],
    ["hero", "gallery", "story", "benefits", "faq", "cta"],
    ["hero", "story", "usecases", "benefits", "specs", "faq", "cta"],
  ],
  benefit: [
    ["hero", "trust", "benefits", "comparison", "specs", "faq", "cta"],
    ["hero", "benefits", "specs", "comparison", "reviews", "faq", "cta"],
    ["hero", "benefits", "usecases", "specs", "faq", "comparison", "cta"],
  ],
  proof: [
    ["hero", "reviews", "benefits", "gallery", "trust", "faq", "cta"],
    ["hero", "trust", "reviews", "gallery", "specs", "faq", "cta"],
    ["hero", "gallery", "reviews", "benefits", "faq", "cta"],
  ],
  offer: [
    ["hero", "offer", "benefits", "trust", "specs", "faq", "cta"],
    ["hero", "trust", "offer", "benefits", "faq", "comparison", "cta"],
    ["hero", "offer", "comparison", "benefits", "specs", "faq", "cta"],
  ],
};

export const LAYOUTS: Record<Exclude<SectionKind, "hero">, string[]> = {
  story: ["image-left", "image-right", "quote-centered"],
  benefits: ["grid-3", "list-numbered", "alternating", "cards-2"],
  gallery: ["mosaic", "strip", "grid-2"],
  specs: ["table", "cards"],
  reviews: ["cards", "quote-wall", "single-featured"],
  faq: ["accordion", "two-column"],
  cta: ["center", "split"],
  trust: ["bar", "grid"],
  comparison: ["table"],
  usecases: ["columns", "stacked"],
  offer: ["panel-split", "banner"],
};

const SCHEME_PATTERNS: Scheme[][] = [
  ["light", "tint", "light", "dark", "light", "tint", "light", "accent"],
  ["tint", "light", "dark", "light", "tint", "light", "tint", "dark"],
  ["light", "light", "tint", "light", "accent", "light", "tint", "dark"],
  ["dark", "light", "tint", "dark", "light", "tint", "light", "accent"],
];

function available(kind: SectionKind, ctx: PlanContext): boolean {
  switch (kind) {
    case "reviews": return ctx.hasReviews;
    case "specs": return ctx.hasSpecs;
    case "benefits": return ctx.hasBenefits;
    case "comparison": return ctx.hasMultiVariants;
    case "usecases": return ctx.hasUseCases;
    case "trust": return ctx.hasTrust;
    case "story": return ctx.hasStory;
    default: return true;
  }
}

/** Samples one structural plan. Same seed => same plan. */
export function samplePlan(archetype: Archetype, seed: number, ctx: PlanContext): DesignPlan {
  const r = rng(seed);
  const ri = Math.floor(r() * RECIPES[archetype].length);
  let kinds = RECIPES[archetype][ri].filter((k) => available(k, ctx));
  // Honest adaptation: without genuine reviews the proof design swaps in visual evidence instead of testimonials.
  if (archetype === "proof" && !ctx.hasReviews && !kinds.includes("gallery")) kinds.splice(1, 0, "gallery");
  if (kinds.length < 5) kinds = [...kinds.slice(0, -1), ...(["gallery", "usecases"] as SectionKind[]).filter((k) => !kinds.includes(k)), "cta" as SectionKind].slice(0, 7);
  if (ctx.hasSpecs && !kinds.includes("specs")) { const fi = kinds.indexOf("faq"); kinds.splice(fi >= 0 ? fi : kinds.length - 1, 0, "specs"); } // GEO: always surface verified specs
  const schemes = pick(r, SCHEME_PATTERNS);
  const heroLayout = pick(r, HERO_LAYOUTS[archetype]);
  const mediaPosition = heroLayout.includes("overlay") ? "background" : heroLayout.includes("stack") || heroLayout.includes("center") || heroLayout.includes("banner") ? "top" : pick(r, ["left", "right"] as const);
  const colorMode = pick(r, ["light", "tint", "dark"] as const);
  const sections: SectionPlan[] = kinds.map((kind, i) => ({
    kind,
    layout: kind === "hero" ? heroLayout : pick(r, LAYOUTS[kind]),
    scheme: i === 0 ? (colorMode === "dark" ? "dark" : colorMode === "tint" ? "tint" : "light") : schemes[i % schemes.length],
  }));
  const labels = archetype === "offer" ? ["Add to cart", "Buy now — add to cart"] : ["Add to cart", "Add to cart"];
  return {
    archetype,
    recipeId: `${archetype}-${ri + 1}`,
    sections,
    hero: {
      layout: heroLayout,
      mediaPosition,
      align: heroLayout.includes("center") || heroLayout.includes("stack") || heroLayout.includes("banner") ? "center" : pick(r, ["left", "center"] as const),
      density: pick(r, ["low", "medium", "high"] as const),
    },
    galleryStyle: pick(r, ["thumbs-left", "thumbs-below", "stacked", "single-hero"] as const),
    cta: {
      shape: pick(r, ["pill", "rounded", "square"] as const),
      width: pick(r, ["full", "auto"] as const),
      label: labels[Math.floor(r() * labels.length)],
      secondaryPositions: pick(r, [["mid"], ["mid", "after-faq"], ["after-benefits"], []]),
    },
    trustPlacement: ctx.hasTrust ? (kinds.includes("trust") ? "mid" : pick(r, ["hero", "under-buybox", "footer"] as const)) : "none",
    offerPlacement: archetype === "offer" ? (kinds.includes("offer") ? "dedicated-section" : "banner") : pick(r, ["hero-price", "hero-price", "banner"] as const),
    typography: {
      h1Scale: Math.round((2.2 + r() * 2.4) * 20) / 20,
      headingCase: pick(r, ["none", "none", "uppercase"] as const),
      headingWeight: pick(r, [500, 600, 700, 800] as const),
      bodyScale: pick(r, [1, 1.0625, 1.125] as const),
    },
    spacing: pick(r, ["compact", "regular", "airy"] as const),
    colorMode,
  };
}
