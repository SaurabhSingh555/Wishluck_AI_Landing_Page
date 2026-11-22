import { safeFetch } from "../safe-fetch";

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  query: string;
}

export function searchProvider(): "brave" | "serpapi" | "none" {
  if (process.env.SEARCH_PROVIDER === "serpapi" && process.env.SERPAPI_API_KEY) return "serpapi";
  if (process.env.BRAVE_API_KEY && process.env.SEARCH_PROVIDER !== "serpapi") return "brave";
  if (process.env.SERPAPI_API_KEY) return "serpapi";
  return "none";
}

export function buildQueries(category: string, keywords: string[], title: string): string[] {
  const kw = keywords.slice(0, 3).join(" ");
  const cat = category && category !== "general" ? category : keywords[0] ?? title;
  return [
    `${kw || cat} buy online India`,
    `best ${cat} brand India D2C store`,
    `${kw || cat} shopify store India products`,
    `${cat} online India official store`,
  ];
}

async function brave(q: string): Promise<SearchHit[]> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&country=IN&count=20`, {
    headers: { "X-Subscription-Token": process.env.BRAVE_API_KEY!, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Brave Search HTTP ${res.status}`);
  const json = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return (json.web?.results ?? []).map((r: { url: string; title: string; description?: string }) => ({ url: r.url, title: r.title, snippet: r.description ?? "", query: q }));
}

async function serp(q: string): Promise<SearchHit[]> {
  const res = await fetch(`https://serpapi.com/search.json?engine=google&gl=in&hl=en&num=20&q=${encodeURIComponent(q)}&api_key=${process.env.SERPAPI_API_KEY}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);
  const json = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return (json.organic_results ?? []).map((r: { link: string; title: string; snippet?: string }) => ({ url: r.link, title: r.title, snippet: r.snippet ?? "", query: q }));
}

export async function webSearch(queries: string[]): Promise<{ hits: SearchHit[]; errors: string[] }> {
  const provider = searchProvider();
  const hits: SearchHit[] = [];
  const errors: string[] = [];
  if (provider === "none") return { hits, errors: ["No search provider configured (set BRAVE_API_KEY or SERPAPI_API_KEY)."] };
  for (const q of queries) {
    try {
      hits.push(...(provider === "brave" ? await brave(q) : await serp(q)));
    } catch (e) {
      errors.push(`${provider} query "${q}" failed: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, provider === "brave" ? 1100 : 200)); // Brave free tier: 1 req/s
  }
  return { hits, errors };
}

const EXCLUDED = /(amazon|flipkart|myntra|ajio|meesho|snapdeal|nykaa|tatacliq|jiomart|ebay|walmart|aliexpress|alibaba|indiamart|pinterest|facebook|instagram|youtube|reddit|quora|wikipedia|linkedin|twitter|x\.com|medium|blogspot|wordpress|justdial|tripadvisor|trustpilot|mouthshut|pricebaba|smartprix|gadgets360|91mobiles|bing|google)\./i;

export interface Candidate {
  url: string;
  domain: string;
  title: string;
  source: string;
  score: number;
  rationale: string;
}

export function rankCandidates(hits: SearchHit[], sourceDomain: string, keywords: string[], max = 14): Candidate[] {
  const byDomain = new Map<string, Candidate & { queries: Set<string> }>();
  for (const h of hits) {
    let u: URL;
    try {
      u = new URL(h.url);
    } catch {
      continue;
    }
    const domain = u.hostname.replace(/^www\./, "");
    if (domain === sourceDomain.replace(/^www\./, "") || EXCLUDED.test(domain + ".")) continue;
    const text = `${h.title} ${h.snippet}`.toLowerCase();
    const matched = keywords.filter((k) => text.includes(k));
    let score = matched.length * 1.5;
    const reasons: string[] = [];
    if (matched.length) reasons.push(`mentions ${matched.slice(0, 3).join(", ")}`);
    if (/\/products\//.test(u.pathname)) { score += 3; reasons.push("is a product page (/products/)"); }
    else if (/\/collections\//.test(u.pathname)) { score += 1.5; reasons.push("is a collection page"); }
    if (/\.in$|\.co\.in$/.test(domain) || /\bindia\b|₹|\brs\.?\s?\d/i.test(text)) { score += 1.5; reasons.push("Indian D2C signal"); }
    const existing = byDomain.get(domain);
    if (existing) {
      existing.queries.add(h.query);
      existing.score += 1;
      if (/\/products\//.test(u.pathname) && !/\/products\//.test(existing.url)) existing.url = h.url;
      continue;
    }
    byDomain.set(domain, { url: h.url, domain, title: h.title, source: "search", score, rationale: reasons.join("; "), queries: new Set([h.query]) });
  }
  return [...byDomain.values()]
    .map((c) => ({
      url: c.url, domain: c.domain, title: c.title, source: c.source, score: c.score + (c.queries.size > 1 ? 1 : 0),
      rationale: `${c.rationale || "appeared in search results"}${c.queries.size > 1 ? `; surfaced for ${c.queries.size} different queries` : ""}`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

export async function isReachable(url: string): Promise<boolean> {
  try {
    const r = await safeFetch(url, { method: "HEAD", timeoutMs: 6000, maxBytes: 1000 });
    return r.status < 500;
  } catch {
    return false;
  }
}
