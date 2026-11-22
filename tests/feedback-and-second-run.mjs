// Records approve/reject feedback on run #1, then generates run #2 for the same product (memory + novelty test).
import fs from "node:fs";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const j = async (p, o) => { const r = await fetch(BASE + p, { ...o, headers: { "content-type": "application/json" }, body: o?.body ? JSON.stringify(o.body) : undefined }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runs = JSON.parse(fs.readFileSync("tests/artifacts/runs.json", "utf8")).filter((r) => r.runId);
const first = await j(`/api/runs/${runs[0].runId}`);
await j(`/api/designs/${first.designs[0].id}/feedback`, { method: "POST", body: { decision: "approved" } });
await j(`/api/designs/${first.designs[1].id}/feedback`, { method: "POST", body: { decision: "rejected", reason: "hero too generic" } });
const { runId } = await j("/api/runs", { method: "POST", body: { productId: first.product.id } });
await j(`/api/runs/${runId}/generate`, { method: "POST", body: {} });
let b;
for (let i = 0; i < 90; i++) { await sleep(2000); b = await j(`/api/runs/${runId}`); if (["completed", "error"].includes(b.run.status)) break; }
const rows = b.designs.map((d, i) => ({ label: d.label, novelty: d.noveltyScore, attempts: d.attempts, closest: d.noveltyDetail.closest?.label, closestInSameRun: d.noveltyDetail.closest?.runId === runId, belowThreshold: d.noveltyDetail.belowThreshold, heroRun1: first.designs[i].plan.hero.layout, heroRun2: d.plan.hero.layout, seqRun1: first.designs[i].plan.sections.map((s) => s.kind).join(">"), seqRun2: d.plan.sections.map((s) => s.kind).join(">"), differences: d.noveltyDetail.differences.slice(0, 3) }));
console.table(rows.map(({ differences: _differences, ...r }) => r));
fs.writeFileSync("tests/artifacts/second-run.json", JSON.stringify({ firstRun: runs[0].runId, secondRun: runId, feedback: ["Design A approved", "Design B rejected: hero too generic"], rows }, null, 2));
