// Types shared by the extraction, generation, audit and dashboard layers.

export interface ProductImage {
  src: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface ProductVariant {
  id: number;
  title: string;
  /** minor units (e.g. paise / cents) as returned by Shopify */
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  sku: string | null;
  options: string[];
}

export interface SourcedFact {
  key: string;
  label: string;
  value: string;
  /** where the fact came from, e.g. "json-ld", "description", "products.js" */
  source: string;
}

export interface ReviewData {
  ratingValue: number;
  reviewCount: number;
  source: "json-ld";
  items: Array<{ author: string | null; rating: number | null; body: string; date: string | null }>;
}

export interface ProductData {
  id: number;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  currency: string | null;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  images: ProductImage[];
  options: Array<{ name: string; position: number; values: string[] }>;
  variants: ProductVariant[];
  specs: SourcedFact[];
  policies: SourcedFact[];
  reviews: ReviewData | null;
  seo: { title: string | null; description: string | null; canonical: string | null };
  sources: string[];
  origin: string;
  sourceUrl: string;
}

export interface BrandProfileData {
  name: string;
  tone: string;
  toneSource: "heuristic" | "ai" | "user";
  colors: { primary: string; secondary: string; background: string; text: string; button: string; buttonText: string };
  fonts: { heading: string; body: string; headingHandle: string; bodyHandle: string; headingFallback: boolean; bodyFallback: boolean };
  typography: { h1Size: string; h1Weight: string; h2Size: string; bodySize: string; bodyWeight: string };
  button: { radius: string; paddingY: string; paddingX: string; textTransform: string; fontWeight: string };
  visualStyle: { radius: number; spacing: "compact" | "regular" | "airy"; style: string };
  extractionMethod: "playwright-computed-styles" | "html-css-heuristic";
  notes: string[];
}

export type Archetype = "story" | "benefit" | "proof" | "offer";

export type AuditStatus = "pass" | "fail" | "warn" | "na";
export interface AuditItem {
  id: string;
  group: "SEO" | "AEO" | "GEO";
  title: string;
  status: AuditStatus;
  detail: string;
}
export interface SeoAuditResult {
  scores: { seo: number; aeo: number; geo: number; overall: number };
  items: AuditItem[];
  structuredData: { blocks: number; types: string[]; errors: string[] };
}

export interface NoveltyDetail {
  score: number;
  threshold: number;
  belowThreshold: boolean;
  closest: { designId: string; label: string; runId: string; distance: number } | null;
  components: Record<string, number>;
  differences: string[];
  comparedAgainst: number;
}
