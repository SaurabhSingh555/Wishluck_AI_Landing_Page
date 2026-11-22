import type { NoveltyDetail } from "@/shared/types";
import type { DesignPlan } from "../generator/plan";

/**
 * Layout fingerprint: a compact, comparable description of a design's structure.
 * See docs/ARCHITECTURE.md ("Novelty algorithm") for the weighting rationale.
 */
export interface Fingerprint {
  archetype: string;
  sectionSequence: string[];
  heroComposition: { kind: string; layout: string; mediaPosition: string; align: string; density: string };
  ctaPositions: string[];
  ctaStyle: { shape: string; width: string };
  mediaArrangement: { galleryStyle: string; mediaLayouts: string[]; imageSections: number };
  colorDistribution: { mode: string; schemeSequence: string[]; counts: Record<string, number> };
  trustPlacement: string;
  offerPlacement: string;
  typographyHierarchy: { h1Scale: number; headingCase: string; headingWeight: number; spacing: string };
}

export const NOVELTY_THRESHOLD = 35;
export const WEIGHTS = { sequence: 0.3, hero: 0.2, cta: 0.15, media: 0.15, trustOffer: 0.1, hierarchy: 0.1 } as const;

export function buildFingerprint(plan: DesignPlan): Fingerprint {
  const seq = plan.sections.map((s) => s.kind);
  const counts: Record<string, number> = {};
  plan.sections.forEach((s) => (counts[s.scheme] = (counts[s.scheme] ?? 0) + 1));
  const mediaKinds = new Set(["gallery", "story", "hero"]);
  const ctaPositions = ["hero", "sticky-mobile", "final", ...plan.cta.secondaryPositions];
  return {
    archetype: plan.archetype,
    sectionSequence: seq,
    heroComposition: { kind: plan.archetype, layout: plan.hero.layout, mediaPosition: plan.hero.mediaPosition, align: plan.hero.align, density: plan.hero.density },
    ctaPositions,
    ctaStyle: { shape: plan.cta.shape, width: plan.cta.width },
    mediaArrangement: {
      galleryStyle: plan.galleryStyle,
      mediaLayouts: plan.sections.filter((s) => mediaKinds.has(s.kind)).map((s) => `${s.kind}:${s.layout}`),
      imageSections: plan.sections.filter((s) => mediaKinds.has(s.kind)).length,
    },
    colorDistribution: { mode: plan.colorMode, schemeSequence: plan.sections.map((s) => s.scheme), counts },
    trustPlacement: plan.trustPlacement,
    offerPlacement: plan.offerPlacement,
    typographyHierarchy: { h1Scale: plan.typography.h1Scale, headingCase: plan.typography.headingCase, headingWeight: plan.typography.headingWeight, spacing: plan.spacing },
  };
}

export function levenshtein(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const mismatch = (pairs: Array<[unknown, unknown, number]>) => {
  const total = pairs.reduce((s, p) => s + p[2], 0);
  return pairs.reduce((s, [x, y, w]) => s + (x === y ? 0 : w), 0) / total;
};

function jaccardDistance(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : 1 - inter / union;
}

export interface ComponentDistances {
  sequence: number;
  hero: number;
  cta: number;
  media: number;
  trustOffer: number;
  hierarchy: number;
}

export function componentDistances(a: Fingerprint, b: Fingerprint): ComponentDistances {
  const sequence = levenshtein(a.sectionSequence, b.sectionSequence) / Math.max(a.sectionSequence.length, b.sectionSequence.length, 1);
  const hero = mismatch([
    [a.heroComposition.kind, b.heroComposition.kind, 0.3],
    [a.heroComposition.layout, b.heroComposition.layout, 0.3],
    [a.heroComposition.mediaPosition, b.heroComposition.mediaPosition, 0.15],
    [a.heroComposition.align, b.heroComposition.align, 0.1],
    [a.heroComposition.density, b.heroComposition.density, 0.15],
  ]);
  const cta = 0.6 * jaccardDistance(a.ctaPositions, b.ctaPositions) + 0.4 * mismatch([[a.ctaStyle.shape, b.ctaStyle.shape, 1], [a.ctaStyle.width, b.ctaStyle.width, 1]]);
  const media =
    (a.mediaArrangement.galleryStyle === b.mediaArrangement.galleryStyle ? 0 : 1) * 0.4 +
    jaccardDistance(a.mediaArrangement.mediaLayouts, b.mediaArrangement.mediaLayouts) * 0.4 +
    (Math.abs(a.mediaArrangement.imageSections - b.mediaArrangement.imageSections) / 4) * 0.2;
  const trustOffer = mismatch([[a.trustPlacement, b.trustPlacement, 1], [a.offerPlacement, b.offerPlacement, 1]]);
  const hierarchy =
    Math.min(1, Math.abs(a.typographyHierarchy.h1Scale - b.typographyHierarchy.h1Scale) / 2.4) * 0.3 +
    (a.typographyHierarchy.headingCase === b.typographyHierarchy.headingCase ? 0 : 1) * 0.2 +
    Math.min(1, Math.abs(a.typographyHierarchy.headingWeight - b.typographyHierarchy.headingWeight) / 300) * 0.15 +
    (a.typographyHierarchy.spacing === b.typographyHierarchy.spacing ? 0 : 1) * 0.15 +
    (a.colorDistribution.mode === b.colorDistribution.mode ? 0 : 1) * 0.2;
  return { sequence, hero, cta, media, trustOffer, hierarchy };
}

export function weightedDistance(c: ComponentDistances): number {
  return (
    100 *
    (c.sequence * WEIGHTS.sequence + c.hero * WEIGHTS.hero + c.cta * WEIGHTS.cta + c.media * WEIGHTS.media + c.trustOffer * WEIGHTS.trustOffer + c.hierarchy * WEIGHTS.hierarchy)
  );
}

export function fingerprintDistance(a: Fingerprint, b: Fingerprint): number {
  return weightedDistance(componentDistances(a, b));
}

export interface HistoryItem {
  designId: string;
  label: string;
  runId: string;
  fingerprint: Fingerprint;
}

const COMPONENT_LABEL: Record<keyof ComponentDistances, string> = {
  sequence: "section sequence", hero: "hero composition", cta: "CTA strategy", media: "media/layout", trustOffer: "trust & offer placement", hierarchy: "visual hierarchy",
};

function describeDifferences(a: Fingerprint, b: Fingerprint, c: ComponentDistances): string[] {
  const out: string[] = [];
  if (c.sequence > 0.2) out.push(`Section order: [${a.sectionSequence.join(" → ")}] vs [${b.sectionSequence.join(" → ")}]`);
  if (a.heroComposition.layout !== b.heroComposition.layout || a.heroComposition.kind !== b.heroComposition.kind)
    out.push(`Hero: ${a.heroComposition.kind}/${a.heroComposition.layout} vs ${b.heroComposition.kind}/${b.heroComposition.layout}`);
  if (a.mediaArrangement.galleryStyle !== b.mediaArrangement.galleryStyle) out.push(`Gallery: ${a.mediaArrangement.galleryStyle} vs ${b.mediaArrangement.galleryStyle}`);
  if (a.trustPlacement !== b.trustPlacement) out.push(`Trust placement: ${a.trustPlacement} vs ${b.trustPlacement}`);
  if (a.offerPlacement !== b.offerPlacement) out.push(`Offer placement: ${a.offerPlacement} vs ${b.offerPlacement}`);
  if (a.ctaStyle.shape !== b.ctaStyle.shape || a.ctaStyle.width !== b.ctaStyle.width) out.push(`CTA style: ${a.ctaStyle.shape}/${a.ctaStyle.width} vs ${b.ctaStyle.shape}/${b.ctaStyle.width}`);
  if (a.typographyHierarchy.headingCase !== b.typographyHierarchy.headingCase || Math.abs(a.typographyHierarchy.h1Scale - b.typographyHierarchy.h1Scale) > 0.6)
    out.push(`Typography: H1 ${a.typographyHierarchy.h1Scale}rem/${a.typographyHierarchy.headingCase} vs ${b.typographyHierarchy.h1Scale}rem/${b.typographyHierarchy.headingCase}`);
  if (a.colorDistribution.mode !== b.colorDistribution.mode) out.push(`Color mode: ${a.colorDistribution.mode} vs ${b.colorDistribution.mode}`);
  return out.slice(0, 6);
}

/** Novelty = distance to the CLOSEST design in history (0-100). Higher is more novel. */
export function scoreNovelty(candidate: Fingerprint, history: HistoryItem[], threshold = NOVELTY_THRESHOLD): NoveltyDetail {
  if (!history.length) {
    return { score: 100, threshold, belowThreshold: false, closest: null, components: {}, differences: ["No previous designs in this category — nothing to compare against."], comparedAgainst: 0 };
  }
  let best: { item: HistoryItem; dist: number; comp: ComponentDistances } | null = null;
  for (const h of history) {
    const comp = componentDistances(candidate, h.fingerprint);
    const dist = weightedDistance(comp);
    if (!best || dist < best.dist) best = { item: h, dist, comp };
  }
  const b = best!;
  const components = Object.fromEntries(Object.entries(b.comp).map(([k, v]) => [COMPONENT_LABEL[k as keyof ComponentDistances], Math.round(v * 100)]));
  const score = Math.round(b.dist * 10) / 10;
  return {
    score, threshold, belowThreshold: score < threshold,
    closest: { designId: b.item.designId, label: b.item.label, runId: b.item.runId, distance: score },
    components, differences: describeDifferences(candidate, b.item.fingerprint, b.comp), comparedAgainst: history.length,
  };
}
