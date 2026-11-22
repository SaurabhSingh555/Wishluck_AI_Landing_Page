import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSections, BUYBOX_SNIPPET, MEDIA_SNIPPET, STYLE_SNIPPET } from "../src/lib/shopify/sections";
import { WL_CSS, WL_CSS_PATCH, WL_JS } from "../src/lib/shopify/assets";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const target = path.join(root, "shopify");

const files: Record<string, string> = buildSections({
  bg: "#ffffff",
  text: "#141414",
  accent: "#5b5bd6",
  button: "#5b5bd6",
  buttonText: "#ffffff",
  headingFont: "inter_n4",
  bodyFont: "inter_n4",
  radius: 8,
});
files["snippets/wl-style.liquid"] = STYLE_SNIPPET;
files["snippets/wl-media.liquid"] = MEDIA_SNIPPET;
files["snippets/wl-buybox.liquid"] = BUYBOX_SNIPPET;
files["assets/wl-base.css"] = WL_CSS + WL_CSS_PATCH;
files["assets/wl-product.js"] = WL_JS;

for (const [name, content] of Object.entries(files)) {
  const out = path.join(target, name);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, content, "utf8");
}

console.log(`Exported ${Object.keys(files).length} canonical Shopify files to ${path.relative(root, target)}`);
