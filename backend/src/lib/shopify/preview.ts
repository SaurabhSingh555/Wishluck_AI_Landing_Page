import { Liquid, type TagToken, type TopLevelToken, type Context, type Emitter, type Template } from "liquidjs";
import { formatMoney } from "../generator/copy";
import type { BrandProfileData, ProductData } from "@/shared/types";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;

export function splitSchema(source: string): { liquid: string; schema: Json | null; error?: string } {
  const m = source.match(SCHEMA_RE);
  if (!m) return { liquid: source, schema: null };
  const liquid = source.replace(SCHEMA_RE, "");
  try {
    return { liquid, schema: JSON.parse(m[1]) };
  } catch (e) {
    return { liquid, schema: null, error: (e as Error).message };
  }
}

function kv(args: unknown[]): Json {
  const out: Json = {};
  for (const a of args) if (Array.isArray(a) && typeof a[0] === "string") out[a[0]] = a[1];
  return out;
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === ",") { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const FONT_FALLBACK_SERIF = /playfair|lora|merriweather|cormorant|baskerville|pt_serif/;

export function fontObject(handle: string, familyOverrides: Record<string, string>) {
  const m = handle.match(/^(.*)_n(\d)$/);
  const base = m ? m[1] : handle;
  const weight = m ? Number(m[2]) * 100 : 400;
  const family = familyOverrides[base] ?? base.split("_").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
  return { family: `'${family}'`, fallback_families: FONT_FALLBACK_SERIF.test(base) ? "serif" : "sans-serif", weight, style: "normal", rawFamily: family };
}

export function shopifyProduct(p: ProductData): Json {
  const images = p.images.map((i) => ({ ...i, alt: i.alt }));
  const variants = p.variants.map((v) => ({
    id: v.id, title: v.title, price: v.price, compare_at_price: v.compareAtPrice, available: v.available, sku: v.sku,
    options: v.options, option1: v.options[0], option2: v.options[1], option3: v.options[2], url: `/products/${p.handle}?variant=${v.id}`,
  }));
  const first = variants.find((v) => v.available) ?? variants[0];
  return {
    id: p.id, handle: p.handle, title: p.title, vendor: p.vendor, type: p.productType, tags: p.tags, url: `/products/${p.handle}`,
    description: p.descriptionHtml || p.description, price: p.price, compare_at_price: p.compareAtPrice, available: p.available,
    images, featured_image: images[0], variants, selected_or_first_available_variant: first,
    has_only_default_variant: p.options.length === 1 && p.options[0].values.length === 1 && p.options[0].name === "Title",
    options_with_values: p.options.map((o) => ({ name: o.name, position: o.position, values: o.values, selected_value: first?.options[o.position - 1] })),
    collections: [],
  };
}

function imageUrl(img: unknown, ...args: unknown[]): string {
  if (!img) return "";
  const o = typeof img === "string" ? { src: img } : (img as Json);
  if (!o.src) return "";
  const { width } = kv(args);
  const u = new URL(o.src);
  if (width) u.searchParams.set("width", String(width));
  return `${u.toString()}#wlw=${o.width ?? ""}&wlh=${o.height ?? ""}`;
}

function imageTag(url: string, ...args: unknown[]): string {
  if (!url) return "";
  const a = kv(args);
  const [clean, frag] = url.split("#");
  const f = new URLSearchParams(frag ?? "");
  const natW = Number(f.get("wlw")) || 0;
  const natH = Number(f.get("wlh")) || 0;
  const widths = typeof a.widths === "string" ? a.widths.split(",").map((x: string) => parseInt(x.trim(), 10)).filter(Boolean) : [];
  const withW = (w: number) => { const u = new URL(clean); u.searchParams.set("width", String(w)); return u.toString(); };
  const curW = Number(new URL(clean).searchParams.get("width")) || 800;
  const width = a.width ?? curW;
  const height = a.height ?? (natW && natH ? Math.round((curW * natH) / natW) : undefined);
  const attrs: string[] = [`src="${clean}"`];
  if (widths.length) attrs.push(`srcset="${widths.map((w: number) => `${withW(w)} ${w}w`).join(", ")}"`);
  if (a.sizes) attrs.push(`sizes="${a.sizes}"`);
  attrs.push(`alt="${String(a.alt ?? "").replace(/"/g, "&quot;")}"`);
  attrs.push(`width="${width}"`);
  if (height) attrs.push(`height="${height}"`);
  if (a.loading) attrs.push(`loading="${a.loading}"`);
  if (a.fetchpriority) attrs.push(`fetchpriority="${a.fetchpriority}"`);
  attrs.push('decoding="async"');
  if (a.class) attrs.push(`class="${a.class}"`);
  return `<img ${attrs.join(" ")}>`;
}

export interface EngineOptions {
  files: Record<string, string>;
  currency: string | null;
  origin: string;
  assetBase: string;
  canonical?: string;
}

export function createEngine(o: EngineOptions): Liquid {
  const templates: Record<string, string> = {};
  for (const [path, content] of Object.entries(o.files)) {
    if (path.startsWith("snippets/")) templates[path.replace("snippets/", "")] = splitSchema(content).liquid;
  }
  const engine = new Liquid({
    templates,
    extname: ".liquid",
    root: ["/"],
    outputEscape: undefined,
    globals: {
      routes: { cart_add_url: `${o.origin}/cart/add`, cart_url: `${o.origin}/cart`, root_url: o.origin, all_products_collection_url: `${o.origin}/collections/all` },
      request: { origin: o.origin },
      canonical_url: o.canonical ?? `${o.origin}/products/preview`,
      shop: { url: o.origin },
      cart: { currency: { iso_code: o.currency ?? "" } },
    },
  } as never);
  engine.registerFilter("money", (v: unknown) => (v == null || v === "" ? "" : formatMoney(Number(v), o.currency)));
  engine.registerFilter("image_url", imageUrl);
  engine.registerFilter("image_tag", imageTag);
  engine.registerFilter("font_face", () => "");
  engine.registerFilter("asset_url", (f: string) => `${o.assetBase}/${f}`);
  engine.registerFilter("handleize", (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-"));

  engine.registerTag("style", {
    parse(this: { tpls: Template[] }, token: TagToken, remain: TopLevelToken[]) {
      this.tpls = [];
      const stream = (engine as any).parser.parseStream(remain) // eslint-disable-line @typescript-eslint/no-explicit-any
        .on("template", (t: Template) => this.tpls.push(t))
        .on("tag:endstyle", () => stream.stop())
        .on("end", () => { throw new Error(`tag ${token.getText()} not closed`); });
      stream.start();
    },
    *render(this: { tpls: Template[] }, ctx: Context, emitter: Emitter) {
      emitter.write("<style data-shopify>");
      yield (engine as any).renderer.renderTemplates(this.tpls, ctx, emitter); // eslint-disable-line @typescript-eslint/no-explicit-any
      emitter.write("</style>");
    },
  } as never);

  engine.registerTag("form", {
    parse(this: { tpls: Template[]; raw: string }, token: TagToken, remain: TopLevelToken[]) {
      this.tpls = [];
      this.raw = token.args;
      const stream = (engine as any).parser.parseStream(remain) // eslint-disable-line @typescript-eslint/no-explicit-any
        .on("template", (t: Template) => this.tpls.push(t))
        .on("tag:endform", () => stream.stop())
        .on("end", () => { throw new Error(`tag ${token.getText()} not closed`); });
      stream.start();
    },
    *render(this: { tpls: Template[]; raw: string }, ctx: Context, emitter: Emitter) {
      const parts = splitArgs(this.raw).slice(2);
      const attrs: string[] = [];
      for (const part of parts) {
        const m = part.match(/^([\w-]+)\s*:\s*(.+)$/);
        if (!m) continue;
        const rawVal = m[2].trim();
        const val = /^['"]/.test(rawVal) ? rawVal.slice(1, -1) : String(ctx.getSync(rawVal.split(".")) ?? "");
        attrs.push(`${m[1]}="${val.replace(/"/g, "&quot;")}"`);
      }
      emitter.write(`<form method="post" action="${o.origin}/cart/add" accept-charset="UTF-8" enctype="multipart/form-data" ${attrs.join(" ")}><input type="hidden" name="form_type" value="product"><input type="hidden" name="utf8" value="✓">`);
      yield (engine as any).renderer.renderTemplates(this.tpls, ctx, emitter); // eslint-disable-line @typescript-eslint/no-explicit-any
      emitter.write("</form>");
    },
  } as never);
  return engine;
}

function resolveSettings(schema: Json, overrides: Json, fontFamilies: Record<string, string>): Json {
  const settings: Json = {};
  for (const s of schema.settings ?? []) {
    if (!s.id) continue;
    let v = overrides && s.id in overrides ? overrides[s.id] : s.default;
    if (s.type === "font_picker") v = fontObject(String(v ?? "inter_n4"), fontFamilies);
    if (s.type === "checkbox") v = v === undefined ? false : v;
    if (s.type === "image_picker") v = v ?? "";
    if (v === undefined) v = "";
    settings[s.id] = v;
  }
  return settings;
}

export interface PreviewInput {
  files: Record<string, string>;
  templatePath: string;
  product: ProductData;
  brand: BrandProfileData;
  assetBase: string;
  seo: { title: string; description: string };
  studioNote?: string;
}

export async function renderPreviewHtml(inp: PreviewInput): Promise<string> {
  const template = JSON.parse(inp.files[inp.templatePath]) as { sections: Json; order: string[] };
  const engine = createEngine({ files: inp.files, currency: inp.product.currency, origin: inp.product.origin, assetBase: inp.assetBase, canonical: inp.product.sourceUrl });
  const product = shopifyProduct(inp.product);
  const fontFamilies: Record<string, string> = {};
  const hf = inp.brand.fonts.headingHandle.replace(/_n\d$/, "");
  const bf = inp.brand.fonts.bodyHandle.replace(/_n\d$/, "");
  fontFamilies[hf] = inp.brand.fonts.headingFallback ? hf.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : inp.brand.fonts.heading;
  fontFamilies[bf] = inp.brand.fonts.bodyFallback ? bf.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : inp.brand.fonts.body;

  const used = new Set<string>();
  const out: string[] = [];
  for (const id of template.order) {
    const ts = template.sections[id];
    const src = inp.files[`sections/${ts.type}.liquid`];
    if (!src) throw new Error(`Template references missing section ${ts.type}`);
    const { liquid, schema } = splitSchema(src);
    if (!schema) throw new Error(`Section ${ts.type} has invalid schema`);
    const settings = resolveSettings(schema, ts.settings ?? {}, fontFamilies);
    for (const k of ["heading_font", "body_font"]) if (settings[k]?.rawFamily) used.add(`${settings[k].rawFamily}|${settings[k].weight}`);
    const blocks = (ts.block_order ?? []).map((bid: string) => {
      const b = ts.blocks[bid];
      const bs = (schema.blocks ?? []).find((x: Json) => x.type === b.type);
      return { id: bid, type: b.type, settings: resolveSettings(bs ?? { settings: [] }, b.settings, fontFamilies), shopify_attributes: "" };
    });
    const html = await engine.parseAndRender(liquid, { product, section: { id, settings, blocks } });
    out.push(`<div id="shopify-section-${id}" class="shopify-section">${html}</div>`);
  }
  const families = new Map<string, Set<number>>();
  used.forEach((u) => { const [f, w] = u.split("|"); if (!families.has(f)) families.set(f, new Set([400])); families.get(f)!.add(Number(w) || 400); families.get(f)!.add(700); });
  const gf = [...families.entries()].map(([f, ws]) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${[...ws].sort().join(";")}`).join("&");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(inp.seo.title)}</title>
<meta name="description" content="${esc(inp.seo.description)}">
<link rel="canonical" href="${esc(inp.product.sourceUrl)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${gf ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${gf}&display=swap">` : ""}
<link rel="stylesheet" href="${inp.assetBase}/wl-base.css">
<style>body{margin:0;background:#fff}.wl-site-header{padding:14px 20px;border-bottom:1px solid #0001;font:700 1.05rem system-ui,sans-serif}.wl-site-footer{padding:28px 20px;font:14px system-ui,sans-serif;text-align:center;color:#555}</style>
</head>
<body>
<div class="wl-preview-ribbon" role="note">${esc(inp.studioNote ?? "Studio preview — rendered from the generated Liquid sections. Add to cart opens the source store cart permalink.")}</div>
<header class="wl-site-header">${esc(inp.brand.name)}</header>
<main id="MainContent">${out.join("\n")}</main>
<footer class="wl-site-footer">Preview footer — your theme's footer renders here in Shopify.</footer>
<script src="${inp.assetBase}/wl-product.js" defer></script>
</body>
</html>`;
}

// ---------- validation ----------
const SETTING_TYPES = new Set(["checkbox", "number", "radio", "range", "select", "text", "textarea", "article", "blog", "collection", "collection_list", "color", "color_background", "color_scheme", "color_scheme_group", "font_picker", "html", "image_picker", "inline_richtext", "link_list", "liquid", "page", "product", "product_list", "richtext", "text_alignment", "url", "video", "video_url", "header", "paragraph"]);

export interface ValidationResult {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  errors: string[];
}

export async function validateTheme(files: Record<string, string>, templatePath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const checks: ValidationResult["checks"] = [];
  const add = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); if (!ok) errors.push(`${name}${detail ? `: ${detail}` : ""}`); };
  const engine = createEngine({ files, currency: "USD", origin: "https://example.myshopify.com", assetBase: "/a" });
  const schemas: Record<string, Json> = {};

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith(".liquid")) continue;
    const { liquid, schema, error } = splitSchema(content);
    try { engine.parse(liquid); add(`Liquid syntax: ${path}`, true); } catch (e) { add(`Liquid syntax: ${path}`, false, (e as Error).message.split("\n")[0]); }
    if (!path.startsWith("sections/")) continue;
    const type = path.replace("sections/", "").replace(".liquid", "");
    if (error || !schema) { add(`Schema JSON: ${path}`, false, error ?? "missing {% schema %}"); continue; }
    schemas[type] = schema;
    const problems: string[] = [];
    if (!schema.name || String(schema.name).length > 25) problems.push("name missing or >25 chars");
    const ids = new Set<string>();
    const checkSettings = (list: Json[], ctx: string) => {
      for (const s of list ?? []) {
        if (!SETTING_TYPES.has(s.type)) problems.push(`${ctx}: unknown type ${s.type}`);
        if (s.type === "header" || s.type === "paragraph") continue;
        if (!s.id) { problems.push(`${ctx}: setting without id`); continue; }
        const key = `${ctx}.${s.id}`;
        if (ids.has(key)) problems.push(`duplicate id ${key}`);
        ids.add(key);
        if (!s.label) problems.push(`${key}: missing label`);
        if (s.type === "select" && (!Array.isArray(s.options) || !s.options.every((x: Json) => x.value !== undefined && x.label) || !s.options.some((x: Json) => x.value === s.default)))
          problems.push(`${key}: select default must match an option`);
        if (s.type === "range") {
          const steps = (s.max - s.min) / s.step;
          if (steps > 101 || !Number.isInteger(steps) || s.default < s.min || s.default > s.max || (s.default - s.min) % s.step !== 0) problems.push(`${key}: invalid range definition`);
        }
        if (s.type === "font_picker" && !s.default) problems.push(`${key}: font_picker needs default`);
        if (s.type === "color" && !/^#[0-9a-fA-F]{6}$/.test(s.default ?? "")) problems.push(`${key}: color default must be hex`);
      }
    };
    checkSettings(schema.settings, "settings");
    const bt = new Set<string>();
    for (const b of schema.blocks ?? []) {
      if (bt.has(b.type)) problems.push(`duplicate block type ${b.type}`);
      bt.add(b.type);
      checkSettings(b.settings, `block.${b.type}`);
    }
    add(`Schema valid: ${path}`, problems.length === 0, problems.slice(0, 4).join("; "));
  }

  // template structure & references
  try {
    const tpl = JSON.parse(files[templatePath]);
    const tplErrors: string[] = [];
    if (!tpl.sections || !Array.isArray(tpl.order)) tplErrors.push("missing sections/order");
    for (const id of tpl.order ?? []) if (!tpl.sections[id]) tplErrors.push(`order references unknown section ${id}`);
    for (const [id, s] of Object.entries<Json>(tpl.sections ?? {})) {
      const schema = schemas[s.type];
      if (!schema) { tplErrors.push(`section ${id}: unknown type ${s.type}`); continue; }
      const defs = new Map<string, Json>((schema.settings ?? []).filter((x: Json) => x.id).map((x: Json) => [x.id, x]));
      for (const [k, v] of Object.entries(s.settings ?? {})) {
        const d = defs.get(k);
        if (!d) { tplErrors.push(`section ${id}: unknown setting ${k}`); continue; }
        if (d.type === "select" && !d.options.some((o: Json) => String(o.value) === String(v))) tplErrors.push(`section ${id}.${k}: '${v}' not in options`);
        if (d.type === "range" && (typeof v !== "number" || v < d.min || v > d.max)) tplErrors.push(`section ${id}.${k}: out of range`);
      }
      for (const bid of s.block_order ?? []) {
        const b = s.blocks?.[bid];
        if (!b) tplErrors.push(`section ${id}: block_order references ${bid}`);
        else if (!(schema.blocks ?? []).some((x: Json) => x.type === b.type)) tplErrors.push(`section ${id}: block type ${b.type} not in schema`);
      }
    }
    add("Template JSON structure & references", tplErrors.length === 0, tplErrors.slice(0, 5).join("; "));
  } catch (e) {
    add("Template JSON structure & references", false, (e as Error).message);
  }
  return { ok: errors.length === 0, checks, errors };
}
