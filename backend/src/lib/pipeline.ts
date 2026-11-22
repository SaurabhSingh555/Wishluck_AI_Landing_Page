import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, insertAndGet } from "@/db";
import * as t from "@/db/schema";
import { extractProduct } from "./extract/product";
import { extractBrand } from "./extract/brand";
import { buildQueries, rankCandidates, searchProvider, webSearch, type Candidate } from "./research/search";
import { computeInsights, crawlCompetitor, type Observation } from "./research/crawl";
import { ARCHETYPE_LABEL, samplePlan, type DesignPlan, type PlanContext } from "./generator/plan";
import { buildCopy, shortTitle } from "./generator/copy";
import { buildTheme } from "./shopify/theme";
import { renderPreviewHtml, validateTheme } from "./shopify/preview";
import { auditHtml } from "./audit/seo";
import { buildFingerprint, scoreNovelty, NOVELTY_THRESHOLD, type Fingerprint, type HistoryItem } from "./novelty/novelty";
import { assertSafeUrl } from "./safe-fetch";
import type { Archetype, BrandProfileData, NoveltyDetail, ProductData } from "@/shared/types";

export interface Stage {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "blocked" | "skipped";
  message?: string;
  startedAt?: string;
  endedAt?: string;
}

async function setStage(runId: string, key: string, label: string, status: Stage["status"], message?: string) {
  const [run] = await db.select().from(t.generationRuns).where(eq(t.generationRuns.id, runId));
  const stages = ((run?.stages ?? []) as unknown as Stage[]).slice();
  const i = stages.findIndex((s) => s.key === key);
  const now = new Date().toISOString();
  const prev = i >= 0 ? stages[i] : undefined;
  const next: Stage = { key, label, status, message, startedAt: status === "running" ? now : prev?.startedAt, endedAt: status === "running" ? undefined : now };
  if (i >= 0) stages[i] = next;
  else stages.push(next);
  await db.update(t.generationRuns).set({ stages: stages as never, updatedAt: new Date() }).where(eq(t.generationRuns.id, runId));
}

const bg = (name: string, fn: () => Promise<void>, runId: string) => {
  void fn().catch(async (e) => {
    console.error(`[${name}]`, e);
    await db.update(t.generationRuns).set({ status: "error", error: (e as Error).message.slice(0, 500), updatedAt: new Date() }).where(eq(t.generationRuns.id, runId)).catch(() => undefined);
  });
};

// ---------------------------------------------------------------- analysis
export async function startAnalysis(url: string): Promise<{ runId: string; productId: string }> {
  await assertSafeUrl(url);
  const { product, html, category, keywords, log } = await extractProduct(url);
  const row = await insertAndGet(t.products, {
    sourceUrl: product.sourceUrl, origin: product.origin, handle: product.handle, title: product.title, category, keywords,
    data: product as never, extractionLog: log,
  });
  const run = await insertAndGet(t.generationRuns, {
    productId: row.id, category, runIndex: 1, seed: Math.floor(Math.random() * 1e9), status: "analyzing",
    stages: [{ key: "product", label: "Extract product data", status: "done", message: `${product.variants.length} variants, ${product.images.length} images`, endedAt: new Date().toISOString() }, { key: "brand", label: "Inspect brand (Playwright + computed CSS)", status: "running", startedAt: new Date().toISOString() }] as never,
  });
  bg("brand", async () => {
    const { profile, screenshots } = await extractBrand(product, html, row.id);
    await db.insert(t.brandProfiles).values({ productId: row.id, data: profile as never, detected: profile as never });
    await db.update(t.products).set({ screenshots }).where(eq(t.products.id, row.id));
    await db.update(t.generationRuns).set({ status: "analyzed" }).where(eq(t.generationRuns.id, run.id));
    await setStage(run.id, "brand", "Inspect brand (Playwright + computed CSS)", "done", `${profile.extractionMethod}; ${screenshots.desktop ? "screenshots captured" : "no screenshots"}`);
  }, run.id);
  return { runId: run.id, productId: row.id };
}

export async function newRunForProduct(productId: string): Promise<string> {
  const [p] = await db.select().from(t.products).where(eq(t.products.id, productId));
  if (!p) throw new Error("Product not found");
  const prev = await db.select().from(t.generationRuns).where(eq(t.generationRuns.productId, productId));
  const run = await insertAndGet(t.generationRuns, {
    productId, category: p.category, runIndex: prev.length + 1, seed: Math.floor(Math.random() * 1e9), status: "analyzed",
    stages: [{ key: "product", label: "Extract product data", status: "done", message: "Reused saved product + edited brand profile", endedAt: new Date().toISOString() }, { key: "brand", label: "Brand profile", status: "done", message: "Reused (includes your edits)", endedAt: new Date().toISOString() }] as never,
  });
  return run.id;
}

// ---------------------------------------------------------------- research
export function startResearch(runId: string, manualUrls: string[]) {
  bg("research", () => runResearch(runId, manualUrls), runId);
}

async function runResearch(runId: string, manualUrls: string[]) {
  const [run] = await db.select().from(t.generationRuns).where(eq(t.generationRuns.id, runId));
  const [prod] = await db.select().from(t.products).where(eq(t.products.id, run.productId));
  const product = prod.data as unknown as ProductData;
  await db.update(t.generationRuns).set({ status: "researching", config: { ...run.config, manualUrls } as never }).where(eq(t.generationRuns.id, runId));
  await db.delete(t.competitors).where(eq(t.competitors.runId, runId));

  await setStage(runId, "discover", "Discover competitors", "running");
  const provider = searchProvider();
  let candidates: Candidate[] = [];
  const errors: string[] = [];
  const sourceDomain = new URL(product.origin).hostname;
  if (provider !== "none") {
    const { hits, errors: e } = await webSearch(buildQueries(prod.category, prod.keywords, product.title));
    errors.push(...e);
    candidates = rankCandidates(hits, sourceDomain, prod.keywords, 14);
  }
  for (const u of manualUrls) {
    try {
      const safe = await assertSafeUrl(u);
      candidates.unshift({ url: safe.toString(), domain: safe.hostname.replace(/^www\./, ""), title: "", source: "manual", score: 99, rationale: "Added manually by the user" });
    } catch (e) {
      errors.push(`Manual URL rejected (${u}): ${(e as Error).message}`);
    }
  }
  const seen = new Set<string>();
  candidates = candidates.filter((c) => (seen.has(c.domain) ? false : (seen.add(c.domain), true)));
  if (!candidates.length) {
    await setStage(runId, "discover", "Discover competitors", "blocked", provider === "none" ? "No search provider configured (set BRAVE_API_KEY or SERPAPI_API_KEY) and no manual URLs supplied." : `Search returned no usable candidates. ${errors.join(" ")}`);
    await db.update(t.generationRuns).set({ status: "researched" }).where(eq(t.generationRuns.id, runId));
    return;
  }
  const competitorIds = candidates.map(() => randomUUID());
  await db.insert(t.competitors).values(candidates.map((c, i) => ({
    id: competitorIds[i], runId, productId: prod.id, category: prod.category, url: c.url, domain: c.domain, title: c.title, source: c.source, rationale: c.rationale, score: c.score,
  })));
  const inserted = await db.select().from(t.competitors).where(inArray(t.competitors.id, competitorIds));
  await setStage(runId, "discover", "Discover competitors", "done", `${inserted.length} discovered via ${provider === "none" ? "manual URLs" : provider}${errors.length ? ` (${errors.length} warning(s))` : ""}`);

  await setStage(runId, "crawl", "Crawl & analyze pages (robots.txt respected)", "running", `0/${inserted.length}`);
  const done: Array<{ url: string; obs: Observation }> = [];
  let idx = 0;
  let processed = 0;
  const worker = async () => {
    while (idx < inserted.length) {
      const c = inserted[idx++];
      const out = await crawlCompetitor(c.url, `${c.id}`);
      await db.update(t.competitors).set({ status: out.status, failureReason: out.reason ?? null, title: out.title ?? c.title, screenshots: out.screenshots }).where(eq(t.competitors.id, c.id));
      if (out.status === "crawled" && out.observation) {
        await db.insert(t.competitorObservations).values({ competitorId: c.id, data: out.observation as never });
        done.push({ url: c.url, obs: out.observation });
      }
      processed++;
      await setStage(runId, "crawl", "Crawl & analyze pages (robots.txt respected)", "running", `${processed}/${inserted.length} processed, ${done.length} analyzed`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const limitation = done.length < 8 ? ` Only ${done.length} pages could be analyzed (target 8) — see per-competitor failure reasons.` : "";
  await setStage(runId, "crawl", "Crawl & analyze pages (robots.txt respected)", done.length ? "done" : "error", `${inserted.length} discovered, ${done.length} successfully analyzed.${limitation}`);

  await setStage(runId, "insights", "Compute evidence-backed insights", "running");
  const insights = computeInsights(done);
  await db.delete(t.categoryLearnings).where(eq(t.categoryLearnings.runId, runId));
  if (insights.length) {
    await db.insert(t.categoryLearnings).values(insights.map((i) => ({ category: prod.category, runId, key: i.key, statement: i.statement, supporting: i.supporting, sampleSize: i.sampleSize, evidenceUrls: i.evidenceUrls })));
  }
  await setStage(runId, "insights", "Compute evidence-backed insights", insights.length ? "done" : "skipped", insights.length ? `${insights.length} insights saved to category memory` : "No analyzed pages to learn from");
  await db.update(t.generationRuns).set({ status: "researched" }).where(eq(t.generationRuns.id, runId));
}

// ---------------------------------------------------------------- generation
interface FeedbackRow { decision: string; reason: string | null; plan: DesignPlan }

function feedbackAdjust(plan: DesignPlan, feedback: FeedbackRow[]): number {
  let adj = 0;
  for (const f of feedback) {
    const p = f.plan;
    if (!p || p.archetype !== plan.archetype) continue;
    const reason = (f.reason ?? "").toLowerCase();
    if (f.decision === "rejected") {
      if (p.hero.layout === plan.hero.layout) adj -= reason.includes("hero") ? 14 : 8;
      if (p.recipeId === plan.recipeId) adj -= 6;
      if (reason.includes("color") && p.colorMode === plan.colorMode) adj -= 8;
      if ((reason.includes("font") || reason.includes("typo")) && p.typography.headingCase === plan.typography.headingCase) adj -= 5;
      if (reason.includes("cta") && p.cta.shape === plan.cta.shape) adj -= 5;
    } else if (f.decision === "approved") {
      if (p.hero.layout === plan.hero.layout) adj += 2;
      if (p.galleryStyle === plan.galleryStyle) adj += 1;
      if (p.trustPlacement === plan.trustPlacement) adj += 1;
    }
  }
  return adj;
}

function learningBias(plan: DesignPlan, learnings: Array<{ key: string; supporting: number; sampleSize: number }>): number {
  let b = 0;
  const major = (k: string) => learnings.some((l) => l.key === k && l.sampleSize >= 3 && l.supporting / l.sampleSize > 0.5);
  if (major("social_proof_near_price") && ["hero", "under-buybox"].includes(plan.trustPlacement)) b += 2;
  if (major("trust_multi") && plan.trustPlacement !== "none" && plan.trustPlacement !== "footer") b += 1.5;
  if (major("faq_present") && plan.sections.some((s) => s.kind === "faq")) b += 1;
  if (major("compare_at") && plan.offerPlacement !== "none") b += 1;
  return b;
}

async function loadHistory(category: string): Promise<HistoryItem[]> {
  const rows = await db.select({ designId: t.generatedDesigns.id, label: t.generatedDesigns.label, runId: t.generatedDesigns.runId, fingerprint: t.layoutFingerprints.fingerprint })
    .from(t.layoutFingerprints).innerJoin(t.generatedDesigns, eq(t.layoutFingerprints.designId, t.generatedDesigns.id)).where(eq(t.layoutFingerprints.category, category));
  return rows.map((r) => ({ ...r, fingerprint: r.fingerprint as unknown as Fingerprint }));
}

async function loadFeedback(category: string): Promise<FeedbackRow[]> {
  const rows = await db.select({ decision: t.designFeedback.decision, reason: t.designFeedback.reason, plan: t.generatedDesigns.plan })
    .from(t.designFeedback).innerJoin(t.generatedDesigns, eq(t.designFeedback.designId, t.generatedDesigns.id)).where(eq(t.generatedDesigns.category, category));
  return rows.map((r) => ({ decision: r.decision, reason: r.reason, plan: (r.plan as { plan: DesignPlan }).plan }));
}

export function planContext(product: ProductData, copyBenefits: number, copyUseCases: number, trust: number, storyParas: number): PlanContext {
  return {
    hasReviews: !!product.reviews && product.reviews.items.length > 0,
    hasSpecs: product.specs.length >= 2,
    hasBenefits: copyBenefits >= 2,
    hasMultiVariants: product.variants.length > 1,
    hasUseCases: copyUseCases > 0,
    hasTrust: trust > 0,
    hasStory: storyParas > 0,
  };
}

export function chooseDesign(args: { archetype: Archetype; baseSeed: number; ctx: PlanContext; history: HistoryItem[]; feedback: FeedbackRow[]; learnings: Array<{ key: string; supporting: number; sampleSize: number }> }) {
  const { archetype, baseSeed, ctx, history, feedback, learnings } = args;
  let best: { plan: DesignPlan; fp: Fingerprint; novelty: NoveltyDetail; adjusted: number } | null = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    attempts = attempt;
    for (let i = 0; i < 24; i++) {
      const plan = samplePlan(archetype, baseSeed + attempt * 7919 + i * 104729, ctx);
      const fp = buildFingerprint(plan);
      const novelty = scoreNovelty(fp, history);
      const adjusted = novelty.score + feedbackAdjust(plan, feedback) + learningBias(plan, learnings) + (novelty.belowThreshold ? -1000 : 0);
      if (!best || adjusted > best.adjusted) best = { plan, fp, novelty, adjusted };
    }
    if (best && !best.novelty.belowThreshold) break; // otherwise: regenerate with a different structural plan
  }
  return { ...best!, attempts };
}

async function generateOne(runId: string, archetype: Archetype, extra: { parentDesignId?: string; history: HistoryItem[]; feedback: FeedbackRow[]; learnings: Array<{ key: string; supporting: number; sampleSize: number }>; seedOffset: number }) {
  const [run] = await db.select().from(t.generationRuns).where(eq(t.generationRuns.id, runId));
  const [prod] = await db.select().from(t.products).where(eq(t.products.id, run.productId));
  const [brandRow] = await db.select().from(t.brandProfiles).where(eq(t.brandProfiles.productId, prod.id));
  if (!brandRow) throw new Error("Brand profile not ready yet");
  const product = prod.data as unknown as ProductData;
  const brand = brandRow.data as unknown as BrandProfileData;

  // copy is generated first so the plan only includes sections that have real content
  const preCopy = await buildCopy(product, brand, archetype, run.seed + extra.seedOffset);
  const ctx = planContext(product, preCopy.copy.benefits.length, preCopy.copy.useCases.length, preCopy.copy.trust.length, preCopy.copy.storyParagraphs.length);
  const chosen = chooseDesign({ archetype, baseSeed: run.seed + extra.seedOffset, ctx, history: extra.history, feedback: extra.feedback, learnings: extra.learnings });
  const suffixId = Math.random().toString(36).slice(2, 8);
  const theme = buildTheme({ product, brand, plan: chosen.plan, copy: preCopy.copy, suffixId });
  const validation = await validateTheme(theme.files, theme.templatePath);
  const warnings = [...theme.warnings, ...preCopy.warnings];
  if (!validation.ok) warnings.push(`Theme validation reported ${validation.errors.length} issue(s).`);
  if (chosen.novelty.belowThreshold) warnings.push(`Novelty ${chosen.novelty.score} is below the threshold ${NOVELTY_THRESHOLD} after ${chosen.attempts} structural re-plans (the design space for this category/product is getting crowded).`);

  const seo = { title: preCopy.copy.seoTitle, description: preCopy.copy.seoDescription };
  const design = await insertAndGet(t.generatedDesigns, {
    runId, productId: prod.id, category: prod.category, archetype, label: ARCHETYPE_LABEL[archetype],
    plan: { plan: chosen.plan, brandSnapshot: brand, copySource: preCopy.source, seo, shortTitle: shortTitle(product.title), learningBias: extra.learnings.filter((l) => l.sampleSize >= 3).length } as never,
    files: theme.files, templateSuffix: theme.templateSuffix, noveltyScore: chosen.novelty.score, noveltyDetail: chosen.novelty as never,
    attempts: chosen.attempts, parentDesignId: extra.parentDesignId ?? null, warnings,
  });
  await db.insert(t.layoutFingerprints).values({ designId: design.id, category: prod.category, archetype, fingerprint: chosen.fp as never });
  extra.history.push({ designId: design.id, label: design.label, runId, fingerprint: chosen.fp });

  const html = await renderPreviewHtml({ files: theme.files, templatePath: theme.templatePath, product, brand, assetBase: `/preview/${design.id}/assets`, seo });
  const audit = auditHtml(html, product, shortTitle(product.title));
  await db.insert(t.qualityAudits).values([
    { designId: design.id, type: "seo", score: audit.scores.overall, data: audit as never },
    { designId: design.id, type: "shopify-schema", score: validation.ok ? 100 : Math.round((validation.checks.filter((c) => c.ok).length / validation.checks.length) * 100), data: validation as never },
  ]);
  return design.id;
}

export function startGeneration(runId: string) {
  bg("generate", async () => {
    const [run] = await db.select().from(t.generationRuns).where(eq(t.generationRuns.id, runId));
    await db.update(t.generationRuns).set({ status: "generating", error: null }).where(eq(t.generationRuns.id, runId));
    await setStage(runId, "plan", "Load memory & plan structures", "running");
    const history = await loadHistory(run.category);
    const feedback = await loadFeedback(run.category);
    const learnRows = await db.select().from(t.categoryLearnings).where(eq(t.categoryLearnings.category, run.category)).orderBy(desc(t.categoryLearnings.createdAt)).limit(40);
    const learnings = learnRows.map((l) => ({ key: l.key, supporting: l.supporting, sampleSize: l.sampleSize }));
    await setStage(runId, "plan", "Load memory & plan structures", "done", `${history.length} previous design(s), ${feedback.length} feedback signal(s), ${learnings.length} category learning(s) applied`);
    await setStage(runId, "generate", "Generate 4 designs (copy → Liquid → novelty → audit)", "running", "0/4");
    const existing = await db.select({ id: t.generatedDesigns.id }).from(t.generatedDesigns).where(and(eq(t.generatedDesigns.runId, runId)));
    if (existing.length) throw new Error("This run already has designs. Start a new run to generate again.");
    const archetypes: Archetype[] = ["story", "benefit", "proof", "offer"];
    let n = 0;
    for (const a of archetypes) {
      await generateOne(runId, a, { history, feedback, learnings, seedOffset: n * 31 });
      n++;
      await setStage(runId, "generate", "Generate 4 designs (copy → Liquid → novelty → audit)", "running", `${n}/4`);
    }
    await setStage(runId, "generate", "Generate 4 designs (copy → Liquid → novelty → audit)", "done", "4 designs generated, fingerprinted and audited");
    await db.update(t.generationRuns).set({ status: "completed" }).where(eq(t.generationRuns.id, runId));
  }, runId);
}

export async function regenerateDesign(designId: string): Promise<string> {
  const [d] = await db.select().from(t.generatedDesigns).where(eq(t.generatedDesigns.id, designId));
  if (!d) throw new Error("Design not found");
  const history = await loadHistory(d.category);
  const feedback = await loadFeedback(d.category);
  const learnRows = await db.select().from(t.categoryLearnings).where(eq(t.categoryLearnings.category, d.category)).limit(40);
  const learnings = learnRows.map((l) => ({ key: l.key, supporting: l.supporting, sampleSize: l.sampleSize }));
  return generateOne(d.runId, d.archetype as Archetype, { parentDesignId: d.id, history, feedback, learnings, seedOffset: Math.floor(Math.random() * 1e6) });
}

export async function recordFeedback(designId: string, decision: "approved" | "rejected", reason?: string) {
  await db.insert(t.designFeedback).values({ designId, decision, reason: reason?.slice(0, 300) || null });
  await db.update(t.generatedDesigns).set({ status: decision }).where(eq(t.generatedDesigns.id, designId));
}

export { inArray };
