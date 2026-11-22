import { extractProduct } from "../src/lib/extract/product";
import { extractBrand } from "../src/lib/extract/brand";
import { samplePlan } from "../src/lib/generator/plan";
import { composeRuleCopy } from "../src/lib/generator/copy";
import { buildTheme } from "../src/lib/shopify/theme";
import { validateTheme, renderPreviewHtml } from "../src/lib/shopify/preview";
import fs from "node:fs";
(async () => {
  const url = process.argv[2];
  const { product, html, category, keywords, log } = await extractProduct(url);
  console.log(category, keywords, log, product.variants.length, product.specs.length, product.policies.length);
  const { profile } = await extractBrand(product, html, "smoke");
  console.log(JSON.stringify(profile.colors), profile.fonts, profile.extractionMethod, profile.notes);
  const ctx = { hasReviews: !!product.reviews?.items.length, hasSpecs: product.specs.length >= 2, hasBenefits: true, hasMultiVariants: product.variants.length > 1, hasUseCases: false, hasTrust: product.policies.length > 0, hasStory: true };
  for (const a of ["story", "benefit", "proof", "offer"] as const) {
    const plan = samplePlan(a, 42, ctx);
    const copy = composeRuleCopy(product, profile, a, 1);
    const t = buildTheme({ product, brand: profile, plan, copy, suffixId: "abc123" });
    const v = await validateTheme(t.files, t.templatePath);
    console.log(a, plan.sections.map((s) => s.kind).join(">"), v.ok, v.errors.slice(0, 5));
    const html2 = await renderPreviewHtml({ files: t.files, templatePath: t.templatePath, product, brand: profile, assetBase: "/a", seo: { title: copy.seoTitle, description: copy.seoDescription } });
    fs.writeFileSync(`/tmp/prev-${a}.html`, html2);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
