import { LAYOUTS, HERO_LAYOUTS } from "../generator/plan";

type Json = Record<string, unknown>;

export interface ThemeDefaults {
  bg: string; text: string; accent: string; button: string; buttonText: string;
  headingFont: string; bodyFont: string; radius: number;
}

const label = (v: string) => v.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const opts = (values: string[]) => values.map((value) => ({ value, label: label(value) }));

function commonSettings(d: ThemeDefaults): Json[] {
  return [
    { type: "header", content: "Visibility & layout" },
    { type: "checkbox", id: "show_section", label: "Show section", default: true },
    { type: "select", id: "align", label: "Text alignment", options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }], default: "left" },
    { type: "range", id: "padding_top", label: "Top spacing", min: 0, max: 120, step: 4, unit: "px", default: 56 },
    { type: "range", id: "padding_bottom", label: "Bottom spacing", min: 0, max: 120, step: 4, unit: "px", default: 56 },
    { type: "header", content: "Colors" },
    { type: "color", id: "bg_color", label: "Background", default: d.bg },
    { type: "color", id: "text_color", label: "Text", default: d.text },
    { type: "color", id: "accent_color", label: "Accent", default: d.accent },
    { type: "color", id: "button_color", label: "Button", default: d.button },
    { type: "color", id: "button_text_color", label: "Button text", default: d.buttonText },
    { type: "header", content: "Typography" },
    { type: "font_picker", id: "heading_font", label: "Heading font", default: d.headingFont },
    { type: "font_picker", id: "body_font", label: "Body font", default: d.bodyFont },
    { type: "range", id: "heading_size", label: "Heading size", min: 24, max: 80, step: 2, unit: "px", default: 44 },
    { type: "select", id: "heading_weight", label: "Heading weight", options: [{ value: "500", label: "Medium" }, { value: "600", label: "Semibold" }, { value: "700", label: "Bold" }, { value: "800", label: "Extra bold" }], default: "700" },
    { type: "select", id: "heading_case", label: "Heading case", options: [{ value: "none", label: "As typed" }, { value: "uppercase", label: "Uppercase" }], default: "none" },
    { type: "range", id: "button_radius", label: "Button & card radius", min: 0, max: 40, step: 2, unit: "px", default: d.radius },
  ];
}

function schemaBlock(name: string, settings: Json[], blocks: Json[] = [], preset = true): string {
  const schema: Json = {
    name,
    tag: "section",
    class: "wl-section-wrapper",
    settings,
    blocks,
    enabled_on: { templates: ["product"] },
  };
  if (preset) schema.presets = [{ name, blocks: blocks.slice(0, 1).map((b) => ({ type: b.type })) }];
  return `{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}\n`;
}

const wrapOpen = (kind: string) => `{%- if section.settings.show_section -%}
{%- render 'wl-style', section: section -%}
{%- assign s = section.settings -%}
<section class="wl-section wl-s--${kind} wl-layout--{{ s.layout }} wl-align--{{ s.align }}" aria-labelledby="wl-h-{{ section.id }}">
  <div class="wl-wrap">
`;
const wrapClose = `  </div>
</section>
{%- endif -%}
`;

const head = (extra = "") => `    <div class="wl-sec-head">
      {%- if s.eyebrow != blank -%}<p class="wl-eyebrow">{{ s.eyebrow | escape }}</p>{%- endif -%}
      <h2 id="wl-h-{{ section.id }}">{{ s.heading | escape }}</h2>
      {%- if s.text != blank -%}<div class="wl-lead">{{ s.text }}</div>{%- endif -%}${extra}
    </div>
`;

export const STYLE_SNIPPET = `{%- liquid
  assign hf = section.settings.heading_font
  assign bf = section.settings.body_font
-%}
{%- style -%}
  {{ hf | font_face: font_display: 'swap' }}
  {{ bf | font_face: font_display: 'swap' }}
  #shopify-section-{{ section.id }} {
    --wl-bg: {{ section.settings.bg_color }};
    --wl-text: {{ section.settings.text_color }};
    --wl-accent: {{ section.settings.accent_color }};
    --wl-btn: {{ section.settings.button_color }};
    --wl-btn-text: {{ section.settings.button_text_color }};
    --wl-font-heading: {{ hf.family }}, {{ hf.fallback_families }};
    --wl-font-body: {{ bf.family }}, {{ bf.fallback_families }};
    --wl-hs: {{ section.settings.heading_size }}px;
    --wl-hweight: {{ section.settings.heading_weight }};
    --wl-case: {{ section.settings.heading_case }};
    --wl-pt: {{ section.settings.padding_top }}px;
    --wl-pb: {{ section.settings.padding_bottom }}px;
    --wl-radius: {{ section.settings.button_radius }}px;
  }
{%- endstyle -%}
`;

export const MEDIA_SNIPPET = `{%- liquid
  assign gstyle = style | default: 'thumbs-below'
  assign sizes = '(min-width: 900px) 50vw, 100vw'
-%}
<div class="wl-media" data-style="{{ gstyle }}">
  <ul class="wl-media__list">
    {%- for image in product.images limit: 8 -%}
      {%- assign alt_text = image.alt | default: product.title -%}
      <li class="wl-media__item{% if forloop.first %} is-active{% endif %}" data-i="{{ forloop.index0 }}">
        {%- if forloop.first -%}
          {{ image | image_url: width: 1000 | image_tag: loading: 'eager', fetchpriority: 'high', sizes: sizes, widths: '360, 540, 720, 1000', alt: alt_text }}
        {%- else -%}
          {{ image | image_url: width: 800 | image_tag: loading: 'lazy', sizes: sizes, widths: '360, 540, 800', alt: alt_text }}
        {%- endif -%}
      </li>
    {%- endfor -%}
  </ul>
  {%- if gstyle contains 'thumbs' and product.images.size > 1 -%}
    <div class="wl-media__thumbs">
      {%- for image in product.images limit: 8 -%}
        <button type="button" class="wl-media__thumb" data-wl-thumb="{{ forloop.index0 }}" aria-label="Show image {{ forloop.index }}" aria-current="{% if forloop.first %}true{% else %}false{% endif %}">
          {{ image | image_url: width: 128 | image_tag: loading: 'lazy', width: 64, height: 64, alt: '' }}
        </button>
      {%- endfor -%}
    </div>
  {%- endif -%}
</div>
`;

export const BUYBOX_SNIPPET = `{%- liquid
  assign current_variant = product.selected_or_first_available_variant
  assign form_id = 'wl-form-' | append: section.id
  assign s = section.settings
  assign cart_add_url = routes.cart_add_url | append: '.js'
  assign on_sale = false
  if current_variant.compare_at_price > current_variant.price
    assign on_sale = true
    assign save_pct = current_variant.compare_at_price | minus: current_variant.price | times: 100 | divided_by: current_variant.compare_at_price
  endif
  assign btn_label = s.button_label | default: 'Add to cart'
-%}
<div class="wl-buybox" data-wl-product>
  <script type="application/json" data-wl-variants>
    [{%- for v in product.variants -%}{"id":{{ v.id }},"available":{{ v.available | json }},"price":{{ v.price | money | json }},"compare":{% if v.compare_at_price > v.price %}{{ v.compare_at_price | money | json }}{% else %}""{% endif %},"onSale":{% if v.compare_at_price > v.price %}true{% else %}false{% endif %},"save":{% if v.compare_at_price > v.price %}{{ v.compare_at_price | minus: v.price | times: 100 | divided_by: v.compare_at_price }}{% else %}0{% endif %},"options":{{ v.options | json }}}{% unless forloop.last %},{% endunless %}{%- endfor -%}]
  </script>
  <div class="wl-price">
    <span class="wl-price__current" data-wl-price>{{ current_variant.price | money }}</span>
    <s class="wl-price__compare" data-wl-compare{% unless on_sale %} hidden{% endunless %}>{% if on_sale %}{{ current_variant.compare_at_price | money }}{% endif %}</s>
    <span class="wl-price__save" data-wl-save{% unless on_sale %} hidden{% endunless %}>{% if on_sale %}Save {{ save_pct }}%{% endif %}</span>
  </div>
  {%- form 'product', product, id: form_id, class: 'wl-form wl-buybox', novalidate: 'novalidate', data-cart-add-url: cart_add_url -%}
    <input type="hidden" name="id" value="{{ current_variant.id }}" data-wl-variant-id>
    {%- unless product.has_only_default_variant -%}
      {%- for option in product.options_with_values -%}
        {%- assign oi = forloop.index -%}
        <fieldset class="wl-option">
          <legend>{{ option.name | escape }}</legend>
          <div class="wl-option__values">
            {%- for value in option.values -%}
              {%- assign oid = form_id | append: '-' | append: oi | append: '-' | append: forloop.index -%}
              <input type="radio" id="{{ oid }}" name="wl-option-{{ oi }}" value="{{ value | escape }}"{% if option.selected_value == value %} checked{% endif %}>
              <label for="{{ oid }}">{{ value | escape }}</label>
            {%- endfor -%}
          </div>
        </fieldset>
      {%- endfor -%}
    {%- endunless -%}
    <div class="wl-buy-row">
      {%- if s.show_quantity -%}
        <div class="wl-qty" role="group" aria-label="Quantity">
          <button type="button" data-wl-qty="-1" aria-label="Decrease quantity">&minus;</button>
          <input type="number" name="quantity" value="1" min="1" inputmode="numeric" aria-label="Quantity">
          <button type="button" data-wl-qty="1" aria-label="Increase quantity">+</button>
        </div>
      {%- else -%}
        <input type="hidden" name="quantity" value="1">
      {%- endif -%}
      <button type="submit" name="add" class="wl-btn{% if s.button_width == 'auto' %} wl-btn--auto{% endif %}" data-wl-atc data-label="{{ btn_label | escape }}"{% unless current_variant.available %} disabled{% endunless %}>
        <span data-wl-atc-label>{% if current_variant.available %}{{ btn_label | escape }}{% else %}Sold out{% endif %}</span>
      </button>
    </div>
    <p class="wl-status" role="status" aria-live="polite" data-wl-status></p>
    <a class="wl-cart-link" href="{{ routes.cart_url }}" data-wl-cart-link hidden>View cart</a>
  {%- endform -%}
  <div class="wl-sticky" data-wl-sticky role="region" aria-label="Quick add to cart">
    <div class="wl-sticky__info">
      <span class="wl-sticky__title">{{ product.title | escape }}</span>
      <span class="wl-sticky__price" data-wl-sticky-price>{{ current_variant.price | money }}</span>
    </div>
    <button type="submit" form="{{ form_id }}" class="wl-btn" data-wl-atc data-label="{{ btn_label | escape }}"{% unless current_variant.available %} disabled{% endunless %}>
      <span data-wl-atc-label>{% if current_variant.available %}{{ btn_label | escape }}{% else %}Sold out{% endif %}</span>
    </button>
  </div>
</div>
`;

export function buildSections(d: ThemeDefaults): Record<string, string> {
  const files: Record<string, string> = {};
  const common = commonSettings(d);

  // ---- hero sections (one per archetype, each with layout variants) ----
  const heroKinds: Array<{ key: string; name: string; bar: string; archetype: keyof typeof HERO_LAYOUTS; extra: Json[] }> = [
    { key: "story", name: "Hero: story-led", archetype: "story", bar: "", extra: [] },
    { key: "benefit", name: "Hero: benefit-first", archetype: "benefit", bar: "", extra: [] },
    {
      key: "proof", name: "Hero: proof-led", archetype: "proof",
      bar: `        {%- if s.rating_text != blank -%}<div class="wl-hero__bar" role="note">{{ s.rating_text | escape }}</div>{%- endif -%}\n`,
      extra: [{ type: "text", id: "rating_text", label: "Rating summary (only verified review data)", default: "" }],
    },
    {
      key: "offer", name: "Hero: offer-led", archetype: "offer",
      bar: `        {%- if s.bar_text != blank -%}<div class="wl-hero__bar" role="note">{{ s.bar_text | escape }}</div>{%- endif -%}\n`,
      extra: [{ type: "text", id: "bar_text", label: "Offer banner (only factual offers)", default: "" }],
    },
  ];
  for (const h of heroKinds) {
    const body = `{%- if section.settings.show_section -%}
{%- render 'wl-style', section: section -%}
{%- assign s = section.settings -%}
{%- assign crumb = product.collections.first -%}
{%- assign hero_bg = s.background_image | default: product.images[1] | default: product.images[0] -%}
<section class="wl-section wl-hero wl-hero-kind--${h.key} wl-hero--{{ s.layout }} wl-hero--density-{{ s.density }} wl-align--{{ s.align }}"{% if s.layout == 'overlay-card' %} style="--wl-hero-bg: url('{{ hero_bg | image_url: width: 1600 }}')"{% endif %} aria-label="{{ product.title | escape }}">
  <div class="wl-wrap">
    <nav class="wl-crumbs" aria-label="Breadcrumb">
      <a href="{{ routes.root_url }}">Home</a> /
      {% if crumb %}<a href="{{ crumb.url }}">{{ crumb.title | escape }}</a>{% else %}<a href="{{ routes.all_products_collection_url }}">All products</a>{% endif %} /
      <span>{{ product.title | escape }}</span>
    </nav>
    <div class="wl-hero__grid">
${h.bar}      <div class="wl-hero__copy">
        {%- if s.eyebrow != blank -%}<p class="wl-eyebrow">{{ s.eyebrow | escape }}</p>{%- endif -%}
        <h1 id="wl-h-{{ section.id }}">{{ s.heading | escape }}</h1>
        {%- if s.subheading != blank -%}<p class="wl-lead">{{ s.subheading | escape }}</p>{%- endif -%}
        {%- if s.show_trust and s.trust_position == 'copy' -%}
          <ul class="wl-trust-list">{%- for block in section.blocks -%}{%- if block.type == 'trust' -%}<li {{ block.shopify_attributes }}>{{ block.settings.text | escape }}</li>{%- endif -%}{%- endfor -%}</ul>
        {%- endif -%}
      </div>
      <div class="wl-hero__chips">
        <ul class="wl-chips">
          {%- for block in section.blocks -%}{%- if block.type == 'highlight' -%}<li {{ block.shopify_attributes }}>{{ block.settings.text | escape }}</li>{%- endif -%}{%- endfor -%}
        </ul>
      </div>
      <div class="wl-hero__media">
        {%- render 'wl-media', product: product, style: s.gallery_style -%}
      </div>
      <div class="wl-hero__buy" id="wl-buy">
        <p class="wl-hero__product">{{ product.title | escape }}</p>
        {%- render 'wl-buybox', product: product, section: section -%}
        {%- if s.show_trust and s.trust_position == 'buy' -%}
          <ul class="wl-trust-list">{%- for block in section.blocks -%}{%- if block.type == 'trust' -%}<li {{ block.shopify_attributes }}>{{ block.settings.text | escape }}</li>{%- endif -%}{%- endfor -%}</ul>
        {%- endif -%}
      </div>
    </div>
  </div>
</section>
{%- endif -%}
`;
    const settings: Json[] = [
      { type: "select", id: "layout", label: "Hero layout", options: opts(HERO_LAYOUTS[h.archetype]), default: HERO_LAYOUTS[h.archetype][0] },
      { type: "select", id: "density", label: "Content density", options: opts(["low", "medium", "high"]), default: "medium" },
      { type: "text", id: "eyebrow", label: "Eyebrow", default: "" },
      { type: "text", id: "heading", label: "Heading (H1)", default: "" },
      { type: "textarea", id: "subheading", label: "Subheading", default: "" },
      ...h.extra,
      { type: "image_picker", id: "background_image", label: "Background image (overlay layout)" },
      { type: "header", content: "Gallery & purchase controls" },
      { type: "select", id: "gallery_style", label: "Gallery style", options: opts(["thumbs-left", "thumbs-below", "stacked", "single-hero"]), default: "thumbs-below" },
      { type: "text", id: "button_label", label: "Button label", default: "Add to cart" },
      { type: "select", id: "button_width", label: "Button width", options: [{ value: "full", label: "Full width" }, { value: "auto", label: "Auto" }], default: "full" },
      { type: "checkbox", id: "show_quantity", label: "Show quantity selector", default: true },
      { type: "checkbox", id: "show_trust", label: "Show verified trust points", default: true },
      { type: "select", id: "trust_position", label: "Trust points position", options: [{ value: "copy", label: "Under heading" }, { value: "buy", label: "Under buy button" }], default: "buy" },
      ...common,
    ];
    const blocks: Json[] = [
      { type: "highlight", name: "Highlight chip", settings: [{ type: "text", id: "text", label: "Text", default: "" }] },
      { type: "trust", name: "Trust point", settings: [{ type: "text", id: "text", label: "Verified trust point", default: "" }] },
    ];
    files[`sections/wl-hero-${h.key}.liquid`] = body + schemaBlock(h.name, settings, blocks, false);
  }

  const sectionSettings = (kind: keyof typeof LAYOUTS | "none", extra: Json[]): Json[] => [
    ...(kind === "none" ? [] : [{ type: "select", id: "layout", label: "Layout", options: opts(LAYOUTS[kind]), default: LAYOUTS[kind][0] }]),
    { type: "text", id: "eyebrow", label: "Eyebrow", default: "" },
    { type: "text", id: "heading", label: "Heading", default: "" },
    ...extra,
    ...common,
  ];

  // ---- trust ----
  files["sections/wl-trust.liquid"] = wrapOpen("trust") + `    {%- if s.heading != blank -%}<h2 id="wl-h-{{ section.id }}" class="wl-visually-hidden">{{ s.heading | escape }}</h2>{%- endif -%}
    <ul class="wl-trust-list">
      {%- for block in section.blocks -%}<li {{ block.shopify_attributes }}>{{ block.settings.text | escape }}</li>{%- endfor -%}
    </ul>
` + wrapClose + schemaBlock("Trust bar", sectionSettings("trust", []), [{ type: "trust_item", name: "Trust point", settings: [{ type: "text", id: "text", label: "Verified trust point", default: "Verified point" }] }]);

  // ---- benefits ----
  files["sections/wl-benefits.liquid"] = wrapOpen("benefits") + head() + `    <div class="wl-grid">
      {%- for block in section.blocks -%}
        <article class="wl-card" {{ block.shopify_attributes }}>
          {%- if block.settings.image != blank -%}{{ block.settings.image | image_url: width: 600 | image_tag: loading: 'lazy', widths: '300, 450, 600', sizes: '(min-width: 800px) 33vw, 100vw', alt: block.settings.heading }}{%- endif -%}
          <h3>{{ block.settings.heading | escape }}</h3>
          <p>{{ block.settings.text | escape }}</p>
        </article>
      {%- endfor -%}
    </div>
` + wrapClose + schemaBlock("Benefits", sectionSettings("benefits", [{ type: "richtext", id: "text", label: "Intro text", default: "" }]), [{ type: "benefit", name: "Benefit", settings: [{ type: "text", id: "heading", label: "Heading", default: "Benefit" }, { type: "textarea", id: "text", label: "Text", default: "Describe this benefit." }, { type: "image_picker", id: "image", label: "Image" }] }]);

  // ---- story ----
  files["sections/wl-story.liquid"] = wrapOpen("story") + `    {%- assign story_img = s.image | default: product.images[1] | default: product.images[0] -%}
    <div class="wl-split">
      <div class="wl-split__media">
        {{ story_img | image_url: width: 900 | image_tag: loading: 'lazy', widths: '360, 540, 720, 900', sizes: '(min-width: 800px) 50vw, 100vw', alt: story_img.alt | default: product.title }}
      </div>
      <div class="wl-split__text">
        {%- if s.eyebrow != blank -%}<p class="wl-eyebrow">{{ s.eyebrow | escape }}</p>{%- endif -%}
        <h2 id="wl-h-{{ section.id }}">{{ s.heading | escape }}</h2>
        <div>{{ s.text }}</div>
      </div>
    </div>
` + wrapClose + schemaBlock("Story", sectionSettings("story", [{ type: "image_picker", id: "image", label: "Image (defaults to a product image)" }, { type: "richtext", id: "text", label: "Story text", default: "<p>Tell the product story here.</p>" }]));

  // ---- gallery ----
  files["sections/wl-gallery.liquid"] = wrapOpen("gallery") + head() + `    <div class="wl-gallery">
      {%- assign skip = 1 -%}
      {%- for image in product.images offset: skip limit: s.image_count -%}
        {%- assign alt_text = image.alt | default: product.title -%}
        <figure>{{ image | image_url: width: 900 | image_tag: loading: 'lazy', widths: '320, 480, 720, 900', sizes: '(min-width: 800px) 33vw, 80vw', alt: alt_text }}</figure>
      {%- endfor -%}
    </div>
` + wrapClose + schemaBlock("Gallery", sectionSettings("gallery", [{ type: "range", id: "image_count", label: "Images to show", min: 2, max: 8, step: 1, default: 5 }]));

  // ---- specs ----
  files["sections/wl-specs.liquid"] = wrapOpen("specs") + head() + `    {%- if s.layout == 'cards' -%}
      <dl class="wl-specs-cards">
        {%- for block in section.blocks -%}<div class="wl-card" {{ block.shopify_attributes }}><dt>{{ block.settings.label | escape }}</dt><dd>{{ block.settings.value | escape }}</dd></div>{%- endfor -%}
      </dl>
    {%- else -%}
      <div class="wl-table-scroll"><table class="wl-table"><caption class="wl-visually-hidden">{{ s.heading | escape }}</caption><tbody>
        {%- for block in section.blocks -%}<tr {{ block.shopify_attributes }}><th scope="row">{{ block.settings.label | escape }}</th><td>{{ block.settings.value | escape }}</td></tr>{%- endfor -%}
      </tbody></table></div>
    {%- endif -%}
` + wrapClose + schemaBlock("Specifications", sectionSettings("specs", []), [{ type: "spec", name: "Specification", settings: [{ type: "text", id: "label", label: "Label", default: "Material" }, { type: "text", id: "value", label: "Value", default: "Value" }] }]);

  // ---- reviews ----
  files["sections/wl-reviews.liquid"] = wrapOpen("reviews") + head(`
      {%- if s.rating_value != blank and s.review_count != blank -%}<p class="wl-rating-summary"><span class="wl-stars" aria-hidden="true">★</span><span>{{ s.rating_value | escape }} / 5 &middot; {{ s.review_count | escape }} reviews</span></p>{%- endif -%}
      {%- if s.source_note != blank -%}<p class="wl-notice">{{ s.source_note | escape }}</p>{%- endif -%}`) + `    <div class="wl-grid">
      {%- for block in section.blocks -%}
        <figure class="wl-card" {{ block.shopify_attributes }}>
          <blockquote>{{ block.settings.body | escape }}</blockquote>
          <figcaption class="wl-review__author">{{ block.settings.author | default: 'Verified buyer' | escape }}{% if block.settings.rating > 0 %} &middot; {{ block.settings.rating }}/5{% endif %}</figcaption>
        </figure>
      {%- endfor -%}
    </div>
` + wrapClose + schemaBlock("Reviews", sectionSettings("reviews", [
    { type: "text", id: "rating_value", label: "Average rating (verified data only)", default: "" },
    { type: "text", id: "review_count", label: "Review count (verified data only)", default: "" },
    { type: "text", id: "source_note", label: "Source note", default: "" },
  ]), [{ type: "review", name: "Review", settings: [{ type: "text", id: "author", label: "Author", default: "" }, { type: "range", id: "rating", label: "Rating", min: 0, max: 5, step: 1, default: 5 }, { type: "textarea", id: "body", label: "Review text (real reviews only)", default: "" }] }]);

  // ---- faq ----
  files["sections/wl-faq.liquid"] = wrapOpen("faq") + head() + `    <div class="wl-faq">
      {%- for block in section.blocks -%}
        <details {{ block.shopify_attributes }}>
          <summary>{{ block.settings.question | escape }}</summary>
          <div class="wl-faq__a">{{ block.settings.answer }}</div>
        </details>
      {%- endfor -%}
    </div>
    {%- if s.enable_schema and section.blocks.size > 0 -%}
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{%- for block in section.blocks -%}{"@type":"Question","name":{{ block.settings.question | json }},"acceptedAnswer":{"@type":"Answer","text":{{ block.settings.answer | strip_html | json }}}}{% unless forloop.last %},{% endunless %}{%- endfor -%}]}
      </script>
    {%- endif -%}
` + wrapClose + schemaBlock("FAQ", sectionSettings("faq", [{ type: "checkbox", id: "enable_schema", label: "Output FAQPage structured data", default: true }]), [{ type: "faq", name: "Question", settings: [{ type: "text", id: "question", label: "Question", default: "Question" }, { type: "richtext", id: "answer", label: "Answer", default: "<p>Answer.</p>" }] }]);

  // ---- comparison (variants) ----
  files["sections/wl-comparison.liquid"] = wrapOpen("comparison") + head() + `    <div class="wl-table-scroll">
      <table class="wl-table">
        <caption class="wl-visually-hidden">{{ s.heading | escape }}</caption>
        <thead><tr><th scope="col">Option</th><th scope="col">Price</th><th scope="col">Availability</th></tr></thead>
        <tbody>
          {%- for v in product.variants limit: 8 -%}
            <tr><th scope="row">{{ v.title | escape }}</th><td>{{ v.price | money }}{% if v.compare_at_price > v.price %} <s>{{ v.compare_at_price | money }}</s>{% endif %}</td><td>{% if v.available %}In stock{% else %}Sold out{% endif %}</td></tr>
          {%- endfor -%}
        </tbody>
      </table>
    </div>
` + wrapClose + schemaBlock("Comparison", sectionSettings("comparison", [{ type: "richtext", id: "text", label: "Intro text", default: "" }]));

  // ---- use cases ----
  files["sections/wl-usecases.liquid"] = wrapOpen("usecases") + head() + `    <div class="wl-grid">
      {%- for block in section.blocks -%}<article class="wl-card" {{ block.shopify_attributes }}><h3>{{ block.settings.heading | escape }}</h3><p>{{ block.settings.text | escape }}</p></article>{%- endfor -%}
    </div>
` + wrapClose + schemaBlock("Use cases", sectionSettings("usecases", []), [{ type: "use_case", name: "Use case", settings: [{ type: "text", id: "heading", label: "Heading", default: "Who it is for" }, { type: "textarea", id: "text", label: "Text", default: "" }] }]);

  // ---- offer ----
  files["sections/wl-offer.liquid"] = wrapOpen("offer") + `    {%- assign cv = product.selected_or_first_available_variant -%}
    <div class="wl-offer">
      <div>
        {%- if s.eyebrow != blank -%}<p class="wl-eyebrow">{{ s.eyebrow | escape }}</p>{%- endif -%}
        <h2 id="wl-h-{{ section.id }}">{{ s.heading | escape }}</h2>
        {%- if s.text != blank -%}<div class="wl-lead">{{ s.text }}</div>{%- endif -%}
        <ul class="wl-trust-list">{%- for block in section.blocks -%}{%- if block.type == 'perk' -%}<li {{ block.shopify_attributes }}>{{ block.settings.text | escape }}</li>{%- endif -%}{%- endfor -%}</ul>
      </div>
      <div class="wl-offer__panel">
        <p class="wl-offer__price">{{ cv.price | money }}{% if cv.compare_at_price > cv.price %}<span class="wl-offer__compare">{{ cv.compare_at_price | money }}</span>{% endif %}</p>
        {%- for block in section.blocks -%}{%- if block.type == 'bundle' -%}<p {{ block.shopify_attributes }}><strong>{{ block.settings.title | escape }}</strong> — {{ block.settings.text | escape }} {{ block.settings.price_text | escape }}</p>{%- endif -%}{%- endfor -%}
        <a class="wl-btn wl-btn--block" href="#wl-buy">{{ s.button_label | default: 'Choose options & add to cart' | escape }}</a>
      </div>
    </div>
` + wrapClose + schemaBlock("Offer", sectionSettings("offer", [{ type: "richtext", id: "text", label: "Intro text", default: "" }, { type: "text", id: "button_label", label: "Button label", default: "Choose options & add to cart" }]), [
    { type: "perk", name: "Verified perk", settings: [{ type: "text", id: "text", label: "Verified shipping/payment/return fact", default: "" }] },
    { type: "bundle", name: "Bundle / offer", settings: [{ type: "text", id: "title", label: "Title", default: "" }, { type: "text", id: "text", label: "Description", default: "" }, { type: "text", id: "price_text", label: "Price text", default: "" }] },
  ]);

  // ---- cta ----
  files["sections/wl-cta.liquid"] = wrapOpen("cta") + `    {%- assign crumb = product.collections.first -%}
    <div class="wl-cta">
      <div>
        <h2 id="wl-h-{{ section.id }}">{{ s.heading | escape }}</h2>
        {%- if s.text != blank -%}<p class="wl-lead">{{ s.text | escape }}</p>{%- endif -%}
        <ul class="wl-trust-list">{%- for block in section.blocks -%}<li {{ block.shopify_attributes }}>{{ block.settings.text | escape }}</li>{%- endfor -%}</ul>
      </div>
      <div>
        <a class="wl-btn" href="#wl-buy">{{ s.button_label | default: 'Add to cart' | escape }}</a>
        <p><a href="{% if crumb %}{{ crumb.url }}{% else %}{{ routes.all_products_collection_url }}{% endif %}">Continue shopping</a></p>
      </div>
    </div>
` + wrapClose + schemaBlock("Final CTA", sectionSettings("cta", [{ type: "textarea", id: "text", label: "Text", default: "" }, { type: "text", id: "button_label", label: "Button label", default: "Add to cart" }]), [{ type: "trust", name: "Trust point", settings: [{ type: "text", id: "text", label: "Verified trust point", default: "" }] }]);

  // ---- structured data ----
  files["sections/wl-seo.liquid"] = `{%- if section.settings.show_jsonld -%}
{%- assign img_list = product.images | slice: 0, 6 -%}
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": {{ product.title | json }},
  "url": {{ canonical_url | json }},
  "description": {{ product.description | strip_html | strip_newlines | truncate: 500 | json }},
  "brand": { "@type": "Brand", "name": {{ product.vendor | json }} },
  "image": [{%- for image in img_list -%}{%- assign u = image | image_url: width: 1200 -%}{%- unless u contains 'http' -%}{%- assign u = u | prepend: 'https:' -%}{%- endunless -%}{{ u | json }}{% unless forloop.last %}, {% endunless %}{%- endfor -%}],
  {%- if section.settings.rating_value != blank and section.settings.review_count != blank %}
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": {{ section.settings.rating_value | json }}, "reviewCount": {{ section.settings.review_count | json }} },
  {%- endif %}
  "offers": [{%- for v in product.variants -%}
    {
      "@type": "Offer",
      "url": {{ request.origin | append: product.url | append: '?variant=' | append: v.id | json }},
      "priceCurrency": {{ cart.currency.iso_code | json }},
      "price": {{ v.price | divided_by: 100.0 | json }},
      "availability": "https://schema.org/{% if v.available %}InStock{% else %}OutOfStock{% endif %}"
    }{% unless forloop.last %},{% endunless %}
  {%- endfor -%}]
}
</script>
{%- endif -%}
{% schema %}
${JSON.stringify({
    name: "Structured data",
    tag: "section",
    settings: [
      { type: "paragraph", content: "Outputs Product JSON-LD from live product data. Only fill the rating fields with verified review data; leave blank to omit AggregateRating. Set the SEO title/description in the product's 'Search engine listing' in Shopify admin." },
      { type: "checkbox", id: "show_jsonld", label: "Output Product structured data", default: true },
      { type: "text", id: "rating_value", label: "Average rating (verified only)", default: "" },
      { type: "text", id: "review_count", label: "Review count (verified only)", default: "" },
    ],
    enabled_on: { templates: ["product"] },
    presets: [{ name: "Structured data" }],
  }, null, 2)}
{% endschema %}
`;
  return files;
}
