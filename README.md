# Wishluck · AI Landing Page Studio

Paste a public Shopify product URL. The studio extracts the product and brand system, researches comparable competitor pages, writes four genuinely different landing-page directions, checks SEO/AEO/GEO and Shopify-schema validity, and publishes editable Online Store 2.0 sections to a Shopify theme (or downloads them as a ZIP).

## 1. Quick start

Requirements: Node.js 20+, MySQL 8, npm. Playwright Chromium is installed once (`npx playwright install chromium`).

```bash
cp .env.example .env          # fill in your own credentials; .env is gitignored
npm install
# create the database once:
mysql -u root -p -e "CREATE DATABASE wishluck_studio CHARACTER SET utf8mb4;"
npm run db:push               # Drizzle pushes the MySQL schema
npm run dev                   # backend :3001, dashboard :5173
```

Open <http://localhost:5173>. For a single-process production build:

```bash
npm run build
npm start                     # serves the built dashboard + API on :3001
```

**One-command Docker** (extra credit): set `MYSQL_ROOT_PASSWORD` in `.env`, then

```bash
docker compose up --build
```

MySQL is exposed on host port `3307`; the app/dashboard on `http://localhost:3001`. The app container runs `drizzle-kit push` before starting, so the schema is created automatically.

## 2. Repository layout

| Path | What lives there |
| --- | --- |
| `backend/src/server.ts` | Express server: REST API, preview renderer, screenshot assets, static SPA |
| `backend/src/lib/pipeline.ts` | Orchestration: analysis → research → generation → audit, persisted run stages |
| `backend/src/lib/extract/` | Product JSON/JSON-LD extraction, Playwright computed-style brand extraction |
| `backend/src/lib/research/` | Search adapters, robots.txt-aware crawling, evidence-backed insights |
| `backend/src/lib/generator/` | Facts-only copy writer and structural design-plan sampler |
| `backend/src/lib/novelty/` | Layout fingerprint, weighted distance, novelty score |
| `backend/src/lib/shopify/` | Liquid section factory, Liquid preview renderer, Admin API publish, theme validation |
| `backend/src/lib/audit/seo.ts` | SEO / AEO / GEO rule-based checklist and score |
| `backend/src/db/` | Drizzle MySQL schema + connection + insert helper |
| `frontend/` | React + Vite dashboard (Tailwind v4) |
| `shopify/` | Canonical, committed copies of every generated Liquid section/snippet/asset (`npm run export:shopify`) |
| `tests/`, `backend/scripts/` | End-to-end scripts and saved evidence JSON |

## 3. Why these choices

- **Backend — Node + Express + TypeScript.** Thin, predictable HTTP layer; long-running crawl/generate jobs run in the background and report stage progress into MySQL. TypeScript catches mistakes across the many JSON-shaped objects.
- **Dashboard — React + Vite.** The dashboard is entirely client-side; Vite is faster and simpler than a server framework because the backend already owns all persistence and Shopify calls. Dev proxy forwards `/api`, `/preview` and `/files` to `:3001`.
- **Database — MySQL 8 + Drizzle.** Requested locally (running on `3306`); Drizzle gives typed queries with plain SQL migrations. MySQL has no `RETURNING`, so `insertAndGet()` inserts an explicit UUID and reads the row back.
- **Crawling — Playwright** for computed styles and desktop/mobile screenshots, plus an SSRF-safe `fetch` with size caps, redirect validation and a per-domain politeness delay. `robots.txt` is checked before crawling.
- **Search — Brave Search (free tier) or SerpAPI.** Without a key the system honestly reports "manual URLs only" rather than faking competitors.
- **AI — Gemini 2.0 Flash or OpenAI `gpt-4o-mini`** through one small adapter. With no key it falls back to deterministic, facts-only copy. A claim guard rejects copy containing numbers, superlatives or promises not present in the source data. Rough cost: 4 designs × ~8k input + ~2k output tokens ≈ **USD 0.02–0.08 per run** (Gemini Flash is at the low end; `gpt-4o-mini` slightly higher). Crawling/search adds USD 0.00–0.01 (Brave free tier; SerpAPI ≈ USD 0.02/run). Lighthouse and local crawling are free.

## 4. Flow

### 4.1 Product + brand analysis
`/products/<handle>.js` and `/products/<handle>.json` are tried first, then page JSON-LD, then DOM heuristics. We extract title, prices, variants (with **real variant IDs**), images, options, specs, policies, real ratings/reviews, SEO fields and currency. Nothing is invented: if no reviews exist, no rating is emitted.

Brand analysis reads computed styles in Playwright (font family/size/weight, colours, radius, spacing) and cross-checks a screenshot with the CSS; fonts are mapped to the nearest Shopify font-library handle. The dashboard lets you correct colours, fonts, tone, radius and spacing before generation — edits persist and are used in later runs.

### 4.2 Competitor research
Queries are built from category, extracted keywords and product title with an India/D2C bias (e.g. `best <category> brand India D2C store`). Results are de-duplicated by domain, ranked by keyword match, `/products/` path and Indian-domain signals, and marketplaces/social sites are excluded. **At least 8** pages are targeted; each row stores the reason it was picked. Every candidate is checked against `robots.txt`; blocked/failed pages stay visible with their reason and are excluded from insights. Each crawled page yields section order, headline style, price/offer display, trust elements, ATC placement, FAQ, media, urgency and anomalies (desktop + mobile screenshots).

Insights are patterns, not copies: e.g. "6/8 pages show reviews under the price", with the supporting URLs stored alongside. Competitor text, images, logos and code are never copied into generated pages — only abstract placement decisions (e.g. "trust near price") influence planning.

### 4.3 Memory and no-repeat design
MySQL stores category learnings, every design's **layout fingerprint**, feedback (approve/reject + reason) and publish outcomes. The fingerprint captures: section sequence, hero composition, CTA positions/style, media arrangement, colour-scheme distribution, trust/offer placement and typography hierarchy.

"Different" is measured as a weighted distance to the closest previous design in the **same category**:

- section sequence 30% (normalised Levenshtein), hero 20%, CTA 15%, media 15%, trust/offer 10%, hierarchy 10% (Jaccard + attribute mismatch).
- Novelty = distance to the nearest stored fingerprint (0–100). New plans are sampled up to 4 × 24 times, penalised if below the threshold of **35**, and re-planned while below it. The chosen plan's closest design, per-component differences and score are shown in the dashboard.
- Approved designs nudge future plans toward their traits; rejected designs (and reasons such as "hero", "colour", "CTA") penalise matching traits.

### 4.4 Generation
Four directions: story-led, benefit-grid, social-proof-heavy, offer-led. Each is a different section sequence, hero composition, colour scheme, typography scale and CTA strategy — not a reshuffle. Every design is emitted as Liquid sections + snippets + assets + a JSON product template; all defaults come from verified product data.

### 4.5 SEO / AEO / GEO
Each design gets one H1, ordered headings, meta title/description, canonical URL, alt text on images, sizing/srcset, internal collection links and Product JSON-LD (price + availability; `aggregateRating` only when a real rating was found). FAQ blocks generate direct, self-contained answers plus FAQPage JSON-LD. A factual specs table, "who it is for", "what is in the box" and consistent brand naming give generative engines quotable facts. The dashboard shows pass/fail/warn/NA for every check. The generated Liquid is also validated (schema types, defaults, block definitions, template references).

### 4.6 Shopify
Settings include colour pickers, Shopify font pickers, image pickers, text/richtext, buttons and show/hide toggles. Repeating benefits, FAQs, specs, reviews, trust chips and use cases are **blocks** that marketing can add/remove/reorder. Add to cart uses the real Shopify product form (`/cart/add`) with variant ID and quantity; a sticky mobile bar appears after scroll. Publish uploads the generated files to an unpublished duplicate theme via Admin GraphQL and can assign the alternate template; downloadable ZIP includes an `INSTALL.md`.

## 5. Evidence and tests

`tests/artifacts/e2e-results.json` records 24 browser checks (6 products across 4 categories: speakers, earbuds, skincare, apparel) at 360/768/1440px: no horizontal overflow, mobile ATC visible in the first viewport, sticky ATC after scroll, quantity increments, and variant-ID/price/cart-permalink verification for every variant. `runs.json`, `second-run.json`, and `research-run` output contain novelty scores, section sequences, SEO scores and competitor coverage. Regenerate on your machine with:

```bash
npm run build
npm start                       # terminal 1
bash backend/scripts/full-evidence.sh   # terminal 2
```

Lighthouse can be run per design from the dashboard (`POST /api/designs/:id/lighthouse`); JSON reports are written under `data/lighthouse/`.

## 6. Known issues and honest limitations

- **No Shopify credentials/dev-store preview link are included.** Publishing stays `blocked` until `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_TOKEN` are set; the ZIP path works without them. No real store was modified during this build.
- **No AI/search keys are committed.** With no keys the deterministic facts-only copy generator runs and competitor URLs must be supplied manually. Set keys in `.env` to enable the full flow.
- **The 5–7 minute screen recording is not included as a file** — it has to be recorded by the candidate. A shot list is in §7.
- Lighthouse scores depend on the machine and network; the saved JSON is evidence from the machine that produced it, not a guarantee on yours.
- Rich Results Test validation is not called from the app (Google has no public API for it); the JSON-LD structure is validated locally and should be pasted into the Rich Results Test before launch.
- Shopify has no native traffic splitter; the A/B experiment record in the dashboard is configuration only — route traffic with an A/B tool or Shopify Rollouts.
- The novelty threshold is heuristic. Very crowded categories may need a higher threshold or a larger plan space.
- `robots.txt` compliance can reduce the analysed-page count below 8; failures are shown explicitly rather than silently substituted.

## 7. Recording checklist (5–7 minutes)

1. `npm run dev`; paste a product URL; show live stage progress (0:00–0:45).
2. Brand panel: show detected colours/fonts, edit the button colour, save (0:45–1:30).
3. Competitor panel: list, reasons, screenshots, learnings and supporting URLs (1:30–2:15).
4. Design Studio: four designs at mobile/tablet/desktop; point out distinct hero/section sequences and novelty scores (2:15–3:30).
5. SEO panel: pass/fail checklist and JSON-LD; download ZIP (3:30–4:15).
6. Publish to the unpublished duplicate theme; open theme editor, change a colour/font, show blocks (4:15–5:15).
7. Add to cart on mobile with a real variant; then run a second product and show a different fingerprint (5:15–6:30).

## 8. What I would do next

Image generation for on-brand banners, a hosted worker queue (BullMQ) for crawling, vector similarity over past copy in addition to structural fingerprints, automatic Rich Results API checks, per-store theme-diff previews, and real A/B traffic routing.

## 9. Security

Secrets are read only from server environment variables. `.env` is gitignored; `.env.example` contains placeholders only. Crawler URLs are validated against SSRF (no private IPs, no credentials, standard ports only) and every navigation is re-validated. No passwords or tokens appear in the repository.
