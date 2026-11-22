import { sql } from "drizzle-orm";
import { boolean, double, index, int, json, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

const id = () => varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`);
const createdAt = () => timestamp("created_at").notNull().defaultNow();

/** Product extracted from a public Shopify product URL. */
export const products = mysqlTable("products", {
  id: id(),
  sourceUrl: text("source_url").notNull(),
  origin: text("origin").notNull(),
  handle: varchar("handle", { length: 255 }).notNull(),
  title: text("title").notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  keywords: json("keywords").$type<string[]>().notNull().default([]),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  extractionLog: json("extraction_log").$type<string[]>().notNull().default([]),
  screenshots: json("screenshots").$type<{ desktop?: string; mobile?: string }>().notNull().default({}),
  createdAt: createdAt(),
});

export const brandProfiles = mysqlTable("brand_profiles", {
  id: id(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  detected: json("detected").$type<Record<string, unknown>>().notNull(),
  edited: boolean("edited").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const generationRuns = mysqlTable("generation_runs", {
  id: id(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 120 }).notNull(),
  runIndex: int("run_index").notNull().default(1),
  seed: int("seed").notNull(),
  status: varchar("status", { length: 40 }).notNull().default("created"),
  stages: json("stages").$type<Array<Record<string, unknown>>>().notNull().default([]),
  config: json("config").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const competitors = mysqlTable(
  "competitors",
  {
    id: id(),
    runId: varchar("run_id", { length: 36 }).notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
    productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 120 }).notNull(),
    url: text("url").notNull(),
    domain: varchar("domain", { length: 255 }).notNull(),
    title: text("title"),
    source: varchar("source", { length: 40 }).notNull(),
    rationale: text("rationale").notNull(),
    score: double("score").notNull().default(0),
    /** discovered | crawled | blocked_by_robots | failed */
    status: varchar("status", { length: 40 }).notNull().default("discovered"),
    failureReason: text("failure_reason"),
    screenshots: json("screenshots").$type<{ desktop?: string; mobile?: string }>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("competitors_run_idx").on(t.runId)],
);

export const competitorObservations = mysqlTable("competitor_observations", {
  id: id(),
  competitorId: varchar("competitor_id", { length: 36 }).notNull().references(() => competitors.id, { onDelete: "cascade" }),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const categoryLearnings = mysqlTable(
  "category_learnings",
  {
    id: id(),
    category: varchar("category", { length: 120 }).notNull(),
    runId: varchar("run_id", { length: 36 }).references(() => generationRuns.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 120 }).notNull(),
    statement: text("statement").notNull(),
    supporting: int("supporting").notNull(),
    sampleSize: int("sample_size").notNull(),
    evidenceUrls: json("evidence_urls").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("category_learnings_cat_idx").on(t.category)],
);

export const generatedDesigns = mysqlTable(
  "generated_designs",
  {
    id: id(),
    runId: varchar("run_id", { length: 36 }).notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
    productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 120 }).notNull(),
    archetype: varchar("archetype", { length: 40 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    plan: json("plan").$type<Record<string, unknown>>().notNull(),
    /** Map of theme file path -> content (sections, snippets, assets, templates). */
    files: json("files").$type<Record<string, string>>().notNull(),
    templateSuffix: varchar("template_suffix", { length: 120 }).notNull(),
    /** pending | approved | rejected */
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    noveltyScore: double("novelty_score"),
    noveltyDetail: json("novelty_detail").$type<Record<string, unknown>>(),
    attempts: int("attempts").notNull().default(1),
    parentDesignId: varchar("parent_design_id", { length: 36 }),
    warnings: json("warnings").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("generated_designs_run_idx").on(t.runId), index("generated_designs_cat_idx").on(t.category)],
);

export const layoutFingerprints = mysqlTable("layout_fingerprints", {
  id: id(),
  designId: varchar("design_id", { length: 36 }).notNull().references(() => generatedDesigns.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 120 }).notNull(),
  archetype: varchar("archetype", { length: 40 }).notNull(),
  fingerprint: json("fingerprint").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const designFeedback = mysqlTable("design_feedback", {
  id: id(),
  designId: varchar("design_id", { length: 36 }).notNull().references(() => generatedDesigns.id, { onDelete: "cascade" }),
  decision: varchar("decision", { length: 40 }).notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
});

export const publishHistory = mysqlTable("publish_history", {
  id: id(),
  designId: varchar("design_id", { length: 36 }).notNull().references(() => generatedDesigns.id, { onDelete: "cascade" }),
  /** success | failed | blocked */
  status: varchar("status", { length: 40 }).notNull(),
  shopDomain: varchar("shop_domain", { length: 255 }),
  themeId: varchar("theme_id", { length: 80 }),
  details: json("details").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  createdAt: createdAt(),
});

export const qualityAudits = mysqlTable(
  "quality_audits",
  {
    id: id(),
    designId: varchar("design_id", { length: 36 }).notNull().references(() => generatedDesigns.id, { onDelete: "cascade" }),
    /** seo | shopify-schema | lighthouse | structured-data */
    type: varchar("type", { length: 40 }).notNull(),
    score: double("score"),
    data: json("data").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quality_audits_design_idx").on(t.designId)],
);

export const experiments = mysqlTable("experiments", {
  id: id(),
  runId: varchar("run_id", { length: 36 }).notNull().references(() => generationRuns.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  designAId: varchar("design_a_id", { length: 36 }).notNull().references(() => generatedDesigns.id, { onDelete: "cascade" }),
  designBId: varchar("design_b_id", { length: 36 }).notNull().references(() => generatedDesigns.id, { onDelete: "cascade" }),
  trafficSplit: int("traffic_split").notNull().default(50),
  primaryMetric: varchar("primary_metric", { length: 60 }).notNull().default("add_to_cart_rate"),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  createdAt: createdAt(),
});
