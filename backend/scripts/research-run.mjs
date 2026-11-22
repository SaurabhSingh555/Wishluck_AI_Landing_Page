// Full pipeline for ONE product with competitor research using manually supplied URLs (no search API key needed).
// Prepends the result to tests/artifacts/runs.json.
import fs from "node:fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const [url, ...manualUrls] = process.argv.slice(2);
const j = async (p, o) => { const r = await fetch(BASE + p, { ...o, headers: { "content-type": "application/json" }, body: o?.body ? JSON.stringify(o.body) : undefined }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = async (runId, pred, n = 150) => { let b; for (let i = 0; i < n; i++) { await sleep(2000); b = await j(`/api/runs/${runId}`); if (pred(b)) return b; } return b; };
const { runId } = await j("/api/runs", { method: "POST", body: { url } });
await wait(runId, (b) => b.brand);
await j(`/api/runs/${runId}/research`, { method: "POST", body: { manualUrls } });
await sleep(3000);
let b = await wait(runId, (b) => b.run.status === "researched");
console.log("research:", b.run.stages.filter((s) => ["discover", "crawl", "insights"].includes(s.key)).map((s) => `${s.key}: ${s.message}`).join(" | "));
await j(`/api/runs/${runId}/generate`, { method: "POST", body: {} });
await sleep(2000);
b = await wait(runId, (b) => ["completed", "error"].includes(b.run.status));
const entry = {
  url, runId, category: b.product.category, status: b.run.status, variants: b.product.data.variants.length,
  competitorsDiscovered: b.competitors.length, competitorsAnalyzed: b.competitors.filter((c) => c.status === "crawled").length,
  designs: b.designs.map((d) => ({ id: d.id, label: d.label, novelty: d.noveltyScore, hero: d.plan.hero.layout, seq: d.plan.sections.map((s) => s.kind), seo: d.audits.seo?.scores, schemaOk: d.audits.schema?.ok })),
};
const f = "tests/artifacts/runs.json";
const all = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
fs.writeFileSync(f, JSON.stringify([entry, ...all.filter((r) => r.url !== url)], null, 2));
console.log("done", b.run.status, `${entry.competitorsAnalyzed}/${entry.competitorsDiscovered}`, "competitors analyzed");
