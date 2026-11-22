// Drives the real HTTP API end-to-end for a list of products and writes tests/artifacts/runs.json
import fs from "node:fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const urls = process.argv.slice(2);
const j = async (path, opts) => { const r = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json" }, body: opts?.body ? JSON.stringify(opts.body) : undefined }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
for (const url of urls) {
  const t0 = Date.now();
  try {
    const { runId } = await j("/api/runs", { method: "POST", body: { url } });
    let b;
    for (let i = 0; i < 90; i++) { await sleep(2000); b = await j(`/api/runs/${runId}`); if (b.brand) break; }
    await j(`/api/runs/${runId}/generate`, { method: "POST", body: {} });
    for (let i = 0; i < 120; i++) { await sleep(2000); b = await j(`/api/runs/${runId}`); if (["completed", "error"].includes(b.run.status)) break; }
    out.push({ url, runId, category: b.product.category, status: b.run.status, error: b.run.error, seconds: Math.round((Date.now() - t0) / 1000), variants: b.product.data.variants.length,
      designs: b.designs.map((d) => ({ id: d.id, label: d.label, novelty: d.noveltyScore, hero: d.plan.hero.layout, seq: d.plan.sections.map((s) => s.kind), seo: d.audits.seo?.scores, schemaOk: d.audits.schema?.ok })) });
    console.log("done", url, b.run.status, out.at(-1).seconds + "s");
  } catch (e) { out.push({ url, error: e.message }); console.log("fail", url, e.message); }
}
fs.writeFileSync("tests/artifacts/runs.json", JSON.stringify(out, null, 2));
