import { ensureContrast, mix, readableOn, luminance, contrast } from "../color";
import { buildSections, BUYBOX_SNIPPET, MEDIA_SNIPPET, STYLE_SNIPPET, type ThemeDefaults } from "./sections";
import { WL_CSS, WL_CSS_PATCH, WL_JS } from "./assets";
import type { DesignPlan, Scheme, SectionPlan } from "../generator/plan";
import type { CopyBundle } from "../generator/copy";
import type { BrandProfileData, ProductData } from "@/shared/types";

type Settings = Record<string, string | number | boolean>;
interface TemplateSection {
  type: string;
  settings: Settings;
  blocks?: Record<string, { type: string; settings: Settings }>;
  block_order?: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

export function schemePalette(scheme: Scheme, b: BrandProfileData) {
  const c = b.colors;
  const bg0 = c.background;
  const text0 = ensureContrast(c.text, bg0);
  const pick = (bg: string, text: string, accentSrc: string, btn: string) => {
    const t = ensureContrast(text, bg);
    const accent = ensureContrast(accentSrc, bg, 3);
    let button = btn;
    if (contrast(button, bg) < 2.2) button = readableOn(bg);
    return { bg, text: t, accent, button, buttonText: readableOn(button) };
  };
  switch (scheme) {
    case "tint": return pick(mix(bg0, c.primary, 0.09), text0, c.primary, c.button);
    case "dark": {
      const bg = luminance(c.text) < 0.25 ? c.text : mix("#111111", c.primary, 0.3);
      return pick(bg, readableOn(bg), c.primary, c.button);
    }
    case "accent": {
      const bg = c.primary;
      return pick(bg, readableOn(bg), readableOn(bg), readableOn(bg));
    }
    default: return pick(bg0, text0, c.primary, c.button);
  }
}

function richParas(paras: string[]) {
  return paras.map((p) => `<p>${esc(p)}</p>`).join("");
}

export interface BuiltTheme {
  files: Record<string, string>;
  templateSuffix: string;
  templatePath: string;
  warnings: string[];
}

export function buildTheme(args: { product: ProductData; brand: BrandProfileData; plan: DesignPlan; copy: CopyBundle; suffixId: string }): BuiltTheme {
  const { product: p, brand, plan, copy, suffixId } = args;
  const warnings: string[] = [];
  const base = schemePalette("light", brand);
  const defaults: ThemeDefaults = {
    bg: base.bg, text: base.text, accent: base.accent, button: base.button, buttonText: base.buttonText,
    headingFont: brand.fonts.headingHandle, bodyFont: brand.fonts.bodyHandle, radius: Math.min(16, Math.max(4, brand.visualStyle.radius)),
  };
  const files = buildSections(defaults);
  files["snippets/wl-style.liquid"] = STYLE_SNIPPET;
  files["snippets/wl-media.liquid"] = MEDIA_SNIPPET;
  files["snippets/wl-buybox.liquid"] = BUYBOX_SNIPPET;
  files["assets/wl-base.css"] = WL_CSS + WL_CSS_PATCH;
  files["assets/wl-product.js"] = WL_JS;

  const spacingPx = plan.spacing === "compact" ? 32 : plan.spacing === "airy" ? 88 : 56;
  const radius = plan.cta.shape === "pill" ? 40 : plan.cta.shape === "square" ? 0 : defaults.radius;
  const headingSize = Math.min(80, Math.max(30, Math.round(plan.typography.h1Scale * 16 / 2) * 2));
  const reviewsOk = !!p.reviews && p.reviews.items.length > 0;
  const maxSave = Math.max(0, ...p.variants.filter((v) => v.compareAtPrice).map((v) => Math.round((1 - v.price / v.compareAtPrice!) * 100)));
  const trustItems = copy.trust.slice(0, 5);

  const common = (sp: SectionPlan, i: number): Settings => {
    const pal = schemePalette(sp.scheme, brand);
    return {
      show_section: true,
      align: sp.kind === "cta" ? "center" : plan.hero.align,
      padding_top: i === 0 ? Math.min(spacingPx, 40) : spacingPx,
      padding_bottom: spacingPx,
      bg_color: pal.bg,
      text_color: pal.text,
      accent_color: pal.accent,
      button_color: pal.button,
      button_text_color: pal.buttonText,
      heading_font: brand.fonts.headingHandle,
      body_font: brand.fonts.bodyHandle,
      heading_size: sp.kind === "hero" ? headingSize : Math.min(80, Math.round(headingSize * 0.9 / 2) * 2),
      heading_weight: String(plan.typography.headingWeight),
      heading_case: plan.typography.headingCase,
      button_radius: radius,
    };
  };

  const blocksOf = (type: string, rows: Settings[]) => {
    const blocks: Record<string, { type: string; settings: Settings }> = {};
    const order: string[] = [];
    rows.forEach((settings, i) => {
      const id = `${type}-${i + 1}`;
      blocks[id] = { type, settings };
      order.push(id);
    });
    return { blocks, block_order: order };
  };

  const sections: Record<string, TemplateSection> = {};
  const order: string[] = [];
  const heroPlan = plan.sections[0];
  const benefitHeadings = copy.benefits.map((b) => b.heading).slice(0, 4);

  plan.sections.forEach((sp, i) => {
    const c = common(sp, i);
    const id = sp.kind;
    let ts: TemplateSection | null = null;
    switch (sp.kind) {
      case "hero": {
        const chips =
          plan.archetype === "proof" ? trustItems.slice(0, 4) : plan.archetype === "offer" ? p.policies.map((x) => x.label).slice(0, 4) : benefitHeadings.slice(0, plan.archetype === "story" ? 3 : 4);
        const heroBlocks: Array<[string, { type: string; settings: Settings }]> = [
          ...chips.map((t, j): [string, { type: string; settings: Settings }] => [`highlight-${j + 1}`, { type: "highlight", settings: { text: clip(t, 60) } }]),
          ...trustItems.map((t, j): [string, { type: string; settings: Settings }] => [`trust-${j + 1}`, { type: "trust", settings: { text: clip(t, 80) } }]),
        ];
        const blocks = Object.fromEntries(heroBlocks);
        const showTrust = (plan.trustPlacement === "hero" || plan.trustPlacement === "under-buybox") && trustItems.length > 0;
        ts = {
          type: `wl-hero-${plan.archetype}`,
          settings: {
            ...c,
            layout: sp.layout,
            density: plan.hero.density,
            eyebrow: clip(copy.eyebrow, 40),
            heading: clip(copy.headline, 110),
            subheading: clip(copy.subhead, 220),
            ...(plan.archetype === "proof" && p.reviews ? { rating_text: `${p.reviews.ratingValue}/5 from ${p.reviews.reviewCount} reviews (as published on the product page)` } : {}),
            ...(plan.archetype === "offer" && maxSave >= 5 ? { bar_text: `Save up to ${maxSave}% on listed prices — see variant prices below` } : {}),
            gallery_style: plan.galleryStyle,
            button_label: plan.cta.label,
            button_width: plan.cta.width,
            show_quantity: true,
            show_trust: showTrust,
            trust_position: plan.trustPlacement === "hero" ? "copy" : "buy",
          },
          blocks: blocks as TemplateSection["blocks"],
          block_order: Object.keys(blocks),
        };
        break;
      }
      case "trust":
        ts = { type: "wl-trust", settings: { ...c, layout: sp.layout, heading: "Verified product information", align: "center" }, ...blocksOf("trust_item", trustItems.map((text) => ({ text: clip(text, 80) }))) };
        break;
      case "benefits":
        ts = {
          type: "wl-benefits",
          settings: { ...c, layout: sp.layout, heading: plan.archetype === "story" ? "What you will love" : plan.archetype === "benefit" ? "Key benefits" : "Product highlights" },
          ...blocksOf("benefit", copy.benefits.map((b) => ({ heading: b.heading, text: b.text }))),
        };
        break;
      case "story":
        ts = { type: "wl-story", settings: { ...c, layout: sp.layout, heading: clip(copy.storyHeading, 80), eyebrow: clip(brand.name, 40), text: richParas(copy.storyParagraphs) } };
        break;
      case "gallery":
        ts = { type: "wl-gallery", settings: { ...c, layout: sp.layout, heading: plan.archetype === "proof" ? "See it in detail" : "In detail", image_count: Math.min(6, Math.max(2, p.images.length - 1)) } };
        break;
      case "specs":
        ts = { type: "wl-specs", settings: { ...c, layout: sp.layout, heading: "Specifications" }, ...blocksOf("spec", p.specs.slice(0, 10).map((s) => ({ label: clip(s.label, 40), value: clip(s.value, 120) }))) };
        break;
      case "reviews":
        ts = {
          type: "wl-reviews",
          settings: { ...c, layout: sp.layout, heading: "What buyers say", rating_value: String(p.reviews!.ratingValue), review_count: String(p.reviews!.reviewCount), source_note: "Reviews as published on the original product page (structured data)." },
          ...blocksOf("review", p.reviews!.items.slice(0, 4).map((r) => ({ author: clip(r.author ?? "", 40), rating: Math.round(r.rating ?? 0), body: clip(r.body, 400) }))),
        };
        break;
      case "faq":
        ts = { type: "wl-faq", settings: { ...c, layout: sp.layout, heading: "Frequently asked questions", enable_schema: true }, ...blocksOf("faq", copy.faqs.map((f) => ({ question: clip(f.question, 120), answer: `<p>${esc(f.answer)}</p>` }))) };
        break;
      case "comparison":
        ts = { type: "wl-comparison", settings: { ...c, layout: sp.layout, heading: "Compare options", text: "<p>Prices and availability for each variant of this product.</p>" } };
        break;
      case "usecases":
        ts = { type: "wl-usecases", settings: { ...c, layout: sp.layout, heading: "Who it is for" }, ...blocksOf("use_case", copy.useCases.map((u) => ({ heading: u.heading, text: u.text }))) };
        break;
      case "offer":
        ts = {
          type: "wl-offer",
          settings: { ...c, layout: sp.layout, heading: "Pricing", text: "<p>Price shown is for the default option. Choose your options in the purchase panel for exact variant pricing.</p>", button_label: "Choose options & add to cart" },
          ...blocksOf("perk", p.policies.map((x) => ({ text: clip(x.label, 80) }))),
        };
        break;
      case "cta":
        ts = {
          type: "wl-cta",
          settings: { ...c, layout: sp.layout, heading: clip(`Ready to order ${copy.shortTitle}?`, 90), text: "Choose your options and add it to your cart.", button_label: plan.cta.label },
          ...blocksOf("trust", plan.trustPlacement === "footer" ? trustItems.map((text) => ({ text: clip(text, 80) })) : []),
        };
        break;
    }
    if (ts) {
      sections[id] = ts;
      order.push(id);
    }
  });

  sections["structured-data"] = {
    type: "wl-seo",
    settings: { show_jsonld: true, ...(reviewsOk ? { rating_value: String(p.reviews!.ratingValue), review_count: String(p.reviews!.reviewCount) } : {}) },
  };
  order.push("structured-data");
  if (heroPlan.kind !== "hero") warnings.push("First section is not a hero.");
  if (!reviewsOk) warnings.push("No genuine reviews were found, so no testimonials or AggregateRating are included.");
  if (!p.currency) warnings.push("Currency could not be detected; the theme uses the store currency at render time.");

  const templateSuffix = `wl-${plan.archetype}-${suffixId}`;
  const templatePath = `templates/product.${templateSuffix}.json`;
  files[templatePath] = JSON.stringify({ sections, order }, null, 2);
  files[`docs/${templateSuffix}-README.txt`] = [
    `Wishluck AI Landing Page Studio — ${templateSuffix}`,
    "",
    "Install: upload sections/, snippets/, assets/ and templates/ into an unpublished duplicate of a Dawn / OS 2.0 theme (or use the Studio's Publish flow).",
    `Then assign the alternate template 'product.${templateSuffix}' to the product (Admin → Products → Theme template).`,
    "The product must exist in the target store with matching options/variants; images, variants and prices are read live from that product.",
  ].join("\n");
  return { files, templateSuffix, templatePath, warnings };
}
