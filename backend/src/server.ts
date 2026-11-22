import "./config/env";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import * as t from "./db/schema";
import { dispatch, type ApiRequest } from "./lib/api-router";
import { renderPreviewHtml } from "./lib/shopify/preview";
import { DATA_DIR } from "./lib/browser";
import type { BrandProfileData, ProductData } from "./shared/types";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distDir = path.join(rootDir, "frontend", "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", async (_req, res) => {
  try {
    await db.select({ id: t.products.id }).from(t.products).limit(1);
    res.json({ ok: true, service: "wishluck-backend" });
  } catch (e) {
    res.status(503).json({ ok: false, error: (e as Error).message });
  }
});

const toApiRequest = (req: express.Request): ApiRequest => ({
  url: `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`,
  headers: { get: (name: string) => req.get(name) ?? null },
  json: async () => req.body ?? {},
});

app.all("/api/*splat", async (req, res) => {
  try {
    const segs = req.path.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const response = await dispatch(toApiRequest(req), segs, req.method);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length) res.end(body);
    else res.end();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const htmlCache = new Map<string, string>();

app.get("/preview/:id/assets/:name", async (req, res) => {
  const id = req.params.id!;
  const name = req.params.name!;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[\w.-]+$/.test(name)) return res.sendStatus(404);
  try {
    const [d] = await db.select({ files: t.generatedDesigns.files }).from(t.generatedDesigns).where(eq(t.generatedDesigns.id, id)).limit(1);
    const body = d?.files[`assets/${name}`];
    if (body === undefined) return res.sendStatus(404);
    res.setHeader("content-type", name.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=300");
    return res.send(body);
  } catch {
    return res.sendStatus(500);
  }
});

app.get("/preview/:id", async (req, res) => {
  const id = req.params.id!;
  if (!/^[0-9a-f-]{36}$/.test(id)) return res.sendStatus(404);
  try {
    let html = htmlCache.get(id);
    if (!html) {
      const [d] = await db.select().from(t.generatedDesigns).where(eq(t.generatedDesigns.id, id)).limit(1);
      if (!d) return res.sendStatus(404);
      const [p] = await db.select().from(t.products).where(eq(t.products.id, d.productId)).limit(1);
      const meta = d.plan as unknown as { brandSnapshot: BrandProfileData; seo: { title: string; description: string } };
      html = await renderPreviewHtml({
        files: d.files,
        templatePath: `templates/product.${d.templateSuffix}.json`,
        product: p.data as unknown as ProductData,
        brand: meta.brandSnapshot,
        assetBase: `/preview/${id}/assets`,
        seo: meta.seo,
      });
      htmlCache.set(id, html);
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    return res.send(html);
  } catch (e) {
    return res.status(500).send(`Preview failed: ${(e as Error).message}`);
  }
});

app.get("/files/:name", async (req, res) => {
  const name = req.params.name!;
  if (!/^[\w.-]+$/.test(name)) return res.sendStatus(404);
  try {
    const buf = await fs.readFile(path.join(DATA_DIR, "screenshots", name));
    res.setHeader("content-type", "image/jpeg");
    res.setHeader("cache-control", "public, max-age=3600");
    return res.send(buf);
  } catch {
    return res.sendStatus(404);
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get("*splat", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(port, () => {
  console.log(`Wishluck backend listening on http://localhost:${port}`);
});
