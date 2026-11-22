import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { db, insertAndGet } from "@/db";
import * as t from "@/db/schema";
import { newRunForProduct, recordFeedback, regenerateDesign, startAnalysis, startGeneration, startResearch } from "@/lib/pipeline";
import { rateLimit, UnsafeUrlError } from "@/lib/safe-fetch";
import { listThemes, publishTheme, shopifyConfig, shopifyPublicStatus } from "@/lib/shopify/admin";
import { aiConfig } from "@/lib/ai/adapter";
import { searchProvider } from "@/lib/research/search";
import { browserStatus, DATA_DIR, getBrowser, SHOT_DIR } from "@/lib/browser";
import { SHOPIFY_FONT_OPTIONS } from "@/lib/extract/brand";
import { NOVELTY_THRESHOLD, WEIGHTS } from "@/lib/novelty/novelty";
import type { ProductData } from "@/shared/types";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (message: string, status = 400) => json({ error: message }, status);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a #RRGGBB hex color");

const brandSchema = z.object({
  name: z.string().min(1).max(80),
  tone: z.string().min(2).max(160),
  colors: z.object({ primary: hex, secondary: hex, background: hex, text: hex, button: hex, buttonText: hex }),
  fonts: z.object({ headingHandle: z.string().regex(/^[a-z0-9_]+_n\d$/), bodyHandle: z.string().regex(/^[a-z0-9_]+_n\d$/), heading: z.string().max(60), body: z.string().max(60) }),
  visualStyle: z.object({ radius: z.number().min(0).max(40), spacing: z.enum(["compact", "regular", "airy"]) }),
});

async function runBundle(id: string) {
  const [run] = await db.select().from(t.generationRuns).where(eq(t.generationRuns.id, id));
  if (!run) return null;
  const [product] = await db.select().from(t.products).where(eq(t.products.id, run.productId));
  const [brand] = await db.select().from(t.brandProfiles).where(eq(t.brandProfiles.productId, run.productId));
  const comps = await db.select().from(t.competitors).where(eq(t.competitors.runId, id)).orderBy(desc(t.competitors.score));
  const obs = comps.length ? await db.select().from(t.competitorObservations).where(inArray(t.competitorObservations.competitorId, comps.map((c) => c.id))) : [];
  const learnings = await db.select().from(t.categoryLearnings).where(eq(t.categoryLearnings.runId, id));
  const designs = await db.select({ d: t.generatedDesigns }).from(t.generatedDesigns).where(eq(t.generatedDesigns.runId, id));
  const dids = designs.map((x) => x.d.id);
  const audits = dids.length ? await db.select().from(t.qualityAudits).where(inArray(t.qualityAudits.designId, dids)).orderBy(desc(t.qualityAudits.createdAt)) : [];
  const fps = dids.length ? await db.select().from(t.layoutFingerprints).where(inArray(t.layoutFingerprints.designId, dids)) : [];
  const fb = dids.length ? await db.select().from(t.designFeedback).where(inArray(t.designFeedback.designId, dids)).orderBy(desc(t.designFeedback.createdAt)) : [];
  const pubs = dids.length ? await db.select().from(t.publishHistory).where(inArray(t.publishHistory.designId, dids)).orderBy(desc(t.publishHistory.createdAt)) : [];
  const experiments = await db.select().from(t.experiments).where(eq(t.experiments.runId, id));
  return {
    run, product, brand,
    competitors: comps.map((c) => ({ ...c, observation: obs.find((o) => o.competitorId === c.id)?.data ?? null })),
    learnings,
    designs: designs.map(({ d }) => {
      const { files, ...rest } = d;
      const latest = (type: string) => audits.find((a) => a.designId === d.id && a.type === type);
      return {
        ...rest,
        plan: (d.plan as { plan: unknown }).plan,
        copySource: (d.plan as { copySource: string }).copySource,
        fileList: Object.keys(files),
        fingerprint: fps.find((f) => f.designId === d.id)?.fingerprint ?? null,
        audits: { seo: latest("seo")?.data ?? null, schema: latest("shopify-schema")?.data ?? null, lighthouse: latest("lighthouse")?.data ?? null },
        feedback: fb.filter((f) => f.designId === d.id),
        publishes: pubs.filter((p) => p.designId === d.id),
      };
    }),
    experiments,
  };
}

async function lighthouseFor(designId: string, form: "mobile" | "desktop") {
  const port = process.env.PORT ?? "3001";
  const outDir = path.join(DATA_DIR, "lighthouse");
  await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${designId}-${form}-${Date.now()}.json`);
  const url = `http://127.0.0.1:${port}/preview/${designId}`;
  await new Promise<void>((resolve, reject) => {
    const script = fileURLToPath(new URL("../../scripts/run-lighthouse.mjs", import.meta.url));
    execFile(process.execPath, [script, url, out, form], { timeout: 170000, cwd: process.cwd(), env: process.env }, (err, _so, se) => (err ? reject(new Error((se || err.message).toString().slice(0, 400))) : resolve()));
  });
  return JSON.parse(await fs.readFile(out, "utf8"));
}
const lhBusy = new Set<string>();

export interface ApiRequest {
  url: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

async function handle(req: ApiRequest, method: string, segs: string[]): Promise<Response> {
  const [a, b, c] = segs;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";

  if (method === "GET" && a === "overview") {
    const browser = await getBrowser();
    const runs = await db.select().from(t.generationRuns).orderBy(desc(t.generationRuns.createdAt)).limit(5);
    const counts = {
      products: (await db.select({ id: t.products.id }).from(t.products)).length,
      designs: (await db.select({ id: t.generatedDesigns.id }).from(t.generatedDesigns)).length,
      competitors: (await db.select({ id: t.competitors.id, s: t.competitors.status }).from(t.competitors)).filter((x) => x.s === "crawled").length,
      feedback: (await db.select({ id: t.designFeedback.id }).from(t.designFeedback)).length,
    };
    const ai = aiConfig();
    return json({
      counts, recentRuns: runs,
      integrations: {
        ai: { provider: ai.provider, model: ai.model || null, note: ai.provider === "none" ? "No AI key: facts-only rule-based copy is used (no invented claims)." : "Structured JSON copy with claim guard." },
        search: { provider: searchProvider(), note: searchProvider() === "none" ? "No search key: competitors can only be added manually." : "Live competitor discovery enabled." },
        browser: { available: !!browser, error: browser ? null : browserStatus().lastError },
        shopify: shopifyPublicStatus(),
      },
      novelty: { threshold: NOVELTY_THRESHOLD, weights: WEIGHTS },
      fonts: SHOPIFY_FONT_OPTIONS,
    });
  }

  if (a === "runs" && !b) {
    if (method === "GET") {
      const runs = await db.select({ run: t.generationRuns, title: t.products.title, url: t.products.sourceUrl }).from(t.generationRuns).innerJoin(t.products, eq(t.generationRuns.productId, t.products.id)).orderBy(desc(t.generationRuns.createdAt)).limit(50);
      const ids = runs.map((r) => r.run.id);
      const designs = ids.length ? await db.select({ id: t.generatedDesigns.id, runId: t.generatedDesigns.runId, label: t.generatedDesigns.label, status: t.generatedDesigns.status, novelty: t.generatedDesigns.noveltyScore, archetype: t.generatedDesigns.archetype }).from(t.generatedDesigns).where(inArray(t.generatedDesigns.runId, ids)) : [];
      const dids = designs.map((d) => d.id);
      const fb = dids.length ? await db.select().from(t.designFeedback).where(inArray(t.designFeedback.designId, dids)) : [];
      const pubs = dids.length ? await db.select().from(t.publishHistory).where(inArray(t.publishHistory.designId, dids)) : [];
      return json(runs.map((r) => ({ ...r.run, title: r.title, url: r.url, designs: designs.filter((d) => d.runId === r.run.id).map((d) => ({ ...d, feedback: fb.filter((f) => f.designId === d.id), publishes: pubs.filter((p) => p.designId === d.id) })) })));
    }
    if (method === "POST") {
      const lim = rateLimit(`runs:${ip}`, 10, 60_000);
      if (!lim.ok) return fail(`Rate limit exceeded. Retry in ${lim.retryAfterSec}s.`, 429);
      const body = z.union([z.object({ url: z.string().url() }), z.object({ productId: z.string().uuid() })]).safeParse(await req.json().catch(() => ({})));
      if (!body.success) return fail("Provide a valid product URL.");
      if ("productId" in body.data) return json({ runId: await newRunForProduct(body.data.productId), productId: body.data.productId });
      return json(await startAnalysis(body.data.url));
    }
  }

  if (a === "runs" && b && method === "GET" && !c) {
    const bundle = await runBundle(b);
    return bundle ? json(bundle) : fail("Run not found", 404);
  }
  if (a === "runs" && b && c === "research" && method === "POST") {
    const body = z.object({ manualUrls: z.array(z.string().url()).max(12).default([]) }).safeParse(await req.json().catch(() => ({})));
    if (!body.success) return fail("Invalid manual URLs.");
    startResearch(b, body.data.manualUrls);
    return json({ started: true });
  }
  if (a === "runs" && b && c === "generate" && method === "POST") {
    const [run] = await db.select().from(t.generationRuns).where(eq(t.generationRuns.id, b));
    if (!run) return fail("Run not found", 404);
    const [brand] = await db.select().from(t.brandProfiles).where(eq(t.brandProfiles.productId, run.productId));
    if (!brand) return fail("Brand analysis is still running. Wait for it to finish.", 409);
    startGeneration(b);
    return json({ started: true });
  }

  if (a === "products" && b && c === "brand") {
    const [brand] = await db.select().from(t.brandProfiles).where(eq(t.brandProfiles.productId, b));
    if (!brand) return fail("Brand profile not found", 404);
    if (method === "POST") {
      await db.update(t.brandProfiles).set({ data: brand.detected, edited: false, updatedAt: new Date() }).where(eq(t.brandProfiles.id, brand.id));
      return json({ ok: true });
    }
    if (method === "PUT") {
      const parsed = brandSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      const cur = brand.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const next = {
        ...cur, name: parsed.data.name, tone: parsed.data.tone, toneSource: "user",
        colors: parsed.data.colors,
        fonts: { ...cur.fonts, ...parsed.data.fonts, headingFallback: false, bodyFallback: false },
        visualStyle: { ...cur.visualStyle, ...parsed.data.visualStyle },
      };
      await db.update(t.brandProfiles).set({ data: next, edited: true, updatedAt: new Date() }).where(eq(t.brandProfiles.id, brand.id));
      return json({ ok: true, brand: next });
    }
  }

  if (a === "designs" && b) {
    const [design] = await db.select().from(t.generatedDesigns).where(eq(t.generatedDesigns.id, b));
    if (!design) return fail("Design not found", 404);
    if (c === "feedback" && method === "POST") {
      const body = z.object({ decision: z.enum(["approved", "rejected"]), reason: z.string().max(300).optional() }).safeParse(await req.json().catch(() => ({})));
      if (!body.success) return fail("Invalid feedback.");
      await recordFeedback(b, body.data.decision, body.data.reason);
      return json({ ok: true });
    }
    if (c === "regenerate" && method === "POST") {
      const id = await regenerateDesign(b);
      return json({ designId: id, runId: design.runId });
    }
    if (c === "zip" && method === "GET") {
      const zip = new JSZip();
      for (const [p, content] of Object.entries(design.files)) zip.file(p, content);
      const exps = await db.select().from(t.experiments).where(eq(t.experiments.runId, design.runId));
      const exp = exps.find((e) => e.designAId === b || e.designBId === b);
      if (exp) zip.file("docs/ab-experiment.json", JSON.stringify({ ...exp, note: "Configuration only. Shopify has no native traffic splitter; use an A/B tool or Shopify Rollouts to route traffic between the two template suffixes." }, null, 2));
      zip.file("INSTALL.md", `# ${design.templateSuffix}\n\n1. Duplicate your live theme (Online Store → Themes → … → Duplicate).\n2. Upload this ZIP's folders (sections, snippets, assets, templates) into the duplicate via Edit code, the Shopify CLI (\`shopify theme push --theme <id>\`), or use the Studio's Publish flow.\n3. In Admin → Products → (your product) → Theme template, choose **${design.templateSuffix}**.\n4. Open the theme editor on that product to edit headings, rich text, images, colors, fonts and repeatable blocks.\n\nAll content defaults are generated from verified product data. Review them before launching.\n`);
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      return new Response(new Uint8Array(buf), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${design.templateSuffix}.zip"` } });
    }
    if (c === "lighthouse" && method === "POST") {
      if (lhBusy.has(b)) return fail("A Lighthouse audit is already running for this design.", 409);
      const body = z.object({ form: z.enum(["mobile", "desktop"]).default("mobile") }).parse(await req.json().catch(() => ({})));
      lhBusy.add(b);
      try {
        const result = await lighthouseFor(b, body.form);
        await db.insert(t.qualityAudits).values({ designId: b, type: "lighthouse", score: result.scores.performance, data: result });
        return json(result);
      } catch (e) {
        return fail(`Lighthouse failed: ${(e as Error).message}`, 500);
      } finally {
        lhBusy.delete(b);
      }
    }
    if (c === "publish" && method === "POST") {
      const body = z.object({ themeId: z.string().min(5), assignTemplate: z.boolean().default(false), updateSeo: z.boolean().default(false) }).safeParse(await req.json().catch(() => ({})));
      if (!body.success) return fail("Select a theme to publish to.");
      const cfg = shopifyConfig();
      if (!cfg.configured) {
        await db.insert(t.publishHistory).values({ designId: b, status: "blocked", shopDomain: null, details: {}, error: "Awaiting Shopify credentials (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_TOKEN)." });
        return json({ ok: false, blocked: true, error: "Awaiting Shopify credentials. See Settings for setup; you can still download the ZIP." }, 409);
      }
      const [prod] = await db.select().from(t.products).where(eq(t.products.id, design.productId));
      const meta = design.plan as { seo: { title: string; description: string } };
      const result = await publishTheme({ themeGid: body.data.themeId, files: design.files, templateSuffix: design.templateSuffix, productHandle: (prod.data as unknown as ProductData).handle, assignTemplate: body.data.assignTemplate, seo: body.data.updateSeo ? meta.seo : null });
      await db.insert(t.publishHistory).values({ designId: b, status: result.ok ? "success" : "failed", shopDomain: cfg.domain, themeId: result.themeId ?? null, details: result as never, error: result.error ?? null });
      return json(result, result.ok ? 200 : 502);
    }
  }

  if (a === "shopify" && b === "themes" && method === "GET") {
    const cfg = shopifyConfig();
    if (!cfg.configured) return json({ ...shopifyPublicStatus(), themes: [] });
    try {
      return json({ ...shopifyPublicStatus(), themes: await listThemes() });
    } catch (e) {
      return json({ ...shopifyPublicStatus(), themes: [], error: (e as Error).message }, 502);
    }
  }

  if (a === "experiments" && method === "POST") {
    const body = z.object({ runId: z.string().uuid(), designAId: z.string().uuid(), designBId: z.string().uuid(), name: z.string().min(2).max(80), trafficSplit: z.number().int().min(10).max(90), primaryMetric: z.string().max(40).default("add_to_cart_rate") }).safeParse(await req.json().catch(() => ({})));
    if (!body.success || body.data.designAId === body.data.designBId) return fail("Pick two different designs and a name.");
    const row = await insertAndGet(t.experiments, body.data as unknown as Record<string, unknown>);
    return json(row);
  }

  if (a === "memory" && method === "GET") {
    const category = new URL(req.url).searchParams.get("category");
    const cats = await db.select({ category: t.generatedDesigns.category }).from(t.generatedDesigns);
    const categories = [...new Set(cats.map((x) => x.category))];
    const cat = category ?? categories[0] ?? null;
    if (!cat) return json({ categories: [], category: null, learnings: [], designs: [], feedback: [] });
    const learnings = await db.select().from(t.categoryLearnings).where(eq(t.categoryLearnings.category, cat)).orderBy(desc(t.categoryLearnings.createdAt)).limit(60);
    const designs = await db.select({ id: t.generatedDesigns.id, label: t.generatedDesigns.label, runId: t.generatedDesigns.runId, status: t.generatedDesigns.status, novelty: t.generatedDesigns.noveltyScore, createdAt: t.generatedDesigns.createdAt, fingerprint: t.layoutFingerprints.fingerprint }).from(t.generatedDesigns).innerJoin(t.layoutFingerprints, eq(t.layoutFingerprints.designId, t.generatedDesigns.id)).where(eq(t.generatedDesigns.category, cat)).orderBy(desc(t.generatedDesigns.createdAt));
    const feedback = await db.select({ f: t.designFeedback, label: t.generatedDesigns.label }).from(t.designFeedback).innerJoin(t.generatedDesigns, eq(t.designFeedback.designId, t.generatedDesigns.id)).where(eq(t.generatedDesigns.category, cat)).orderBy(desc(t.designFeedback.createdAt));
    return json({ categories, category: cat, learnings, designs, feedback: feedback.map((x) => ({ ...x.f, label: x.label })) });
  }

  if (a === "files" && b && method === "GET") {
    if (!/^[\w.-]+$/.test(b)) return fail("Bad file name", 400);
    try {
      const buf = await fs.readFile(path.join(SHOT_DIR, b));
      return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" } });
    } catch {
      return fail("Not found", 404);
    }
  }
  return fail("Not found", 404);
}

export async function dispatch(req: ApiRequest, segs: string[], method: string) {
  try {
    return await handle(req, method, segs);
  } catch (e) {
    if (e instanceof UnsafeUrlError) return fail(`URL rejected for safety: ${e.message}`, 400);
    console.error(e);
    return fail((e as Error).message || "Internal error", 500);
  }
}
