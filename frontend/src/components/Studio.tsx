"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { api, Badge, Btn, Card, Empty, ErrorNote, Field, inputCls, JobProgress, Note, Skeleton, usePoll } from "./ui";
import { BrandView, CompetitorView, DesignView, MemoryView, PublishView, SeoView } from "./views";

const NAV = [
  ["overview", "Overview", "◧"],
  ["new", "New Generation", "＋"],
  ["brand", "Brand Intelligence", "◐"],
  ["competitors", "Competitor Research", "⌖"],
  ["designs", "Design Studio", "▣"],
  ["seo", "SEO Intelligence", "◎"],
  ["memory", "Memory and Learnings", "❖"],
  ["history", "History", "↺"],
  ["publish", "Shopify Publishing", "⬆"],
  ["settings", "Settings", "⚙"],
] as const;
export type ViewKey = (typeof NAV)[number][0];

const money = (minor: number, cur: string | null) => {
  try { return cur ? new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur }).format(minor / 100) : (minor / 100).toFixed(2); } catch { return (minor / 100).toFixed(2); }
};

const SAMPLE = [
  ["boAt PartyPal 800 (speaker)", "https://www.boat-lifestyle.com/products/boat-partypal-800"],
];

export default function Studio() {
  const [view, setView] = useState<ViewKey>("overview");
  const [runId, setRunId] = useState<string | null>(null);
  const [designId, setDesignId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("wl-run");
    if (saved) setRunId(saved);
    const v = location.hash.replace("#", "") as ViewKey;
    if (NAV.some((n) => n[0] === v)) setView(v);
  }, []);
  useEffect(() => {
    if (runId) localStorage.setItem("wl-run", runId);
  }, [runId]);
  const go = (v: ViewKey) => { setView(v); setMenu(false); history.replaceState(null, "", `#${v}`); window.scrollTo({ top: 0 }); };

  const overview = usePoll(() => api("/api/overview"), true, 15000);
  const [busyStatus, setBusy] = useState(false);
  const bundle = usePoll<any>(() => (runId ? api(`/api/runs/${runId}`) : Promise.resolve(null)), true, busyStatus ? 1500 : 4000, [runId]);
  const b = bundle.data;
  const status: string | undefined = b?.run?.status;
  const running = ["analyzing", "researching", "generating"].includes(status ?? "");
  useEffect(() => setBusy(running), [running]);
  useEffect(() => {
    if (b?.designs?.length && !b.designs.some((d: any) => d.id === designId)) setDesignId(b.designs[0].id);
  }, [b?.designs?.length, designId, b?.designs]);

  const ctx = { b, runId, setRunId, designId, setDesignId, go, reload: bundle.reload, overview: overview.data, running };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[272px_1fr]">
      <aside className={`${menu ? "block" : "hidden"} fixed inset-0 z-40 overflow-y-auto bg-slate-950 p-4 text-slate-300 lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-lg font-bold text-white">W</div>
          <div>
            <p className="text-sm font-semibold text-white">Wishluck</p>
            <p className="text-xs text-slate-400">AI Landing Page Studio</p>
          </div>
        </div>
        <nav aria-label="Main" className="space-y-1">
          {NAV.map(([k, label, icon]) => (
            <button key={k} onClick={() => go(k)} aria-current={view === k ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${view === k ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white"}`}>
              <span className="w-4 text-center text-slate-400" aria-hidden>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        {b && (
          <div className="mt-6 rounded-xl bg-white/5 p-3 text-xs">
            <p className="font-medium text-white">Active run #{b.run.runIndex}</p>
            <p className="mt-1 line-clamp-2 text-slate-400">{b.product.title}</p>
            <div className="mt-2"><Badge tone={running ? "indigo" : status === "error" ? "red" : "green"}>{status}</Badge></div>
          </div>
        )}
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <span className="font-semibold">Wishluck Studio</span>
          <Btn variant="secondary" onClick={() => setMenu((m) => !m)}>{menu ? "Close" : "Menu"}</Btn>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
          {menu && <button className="fixed right-4 top-3 z-50 rounded-lg bg-white px-3 py-1.5 text-sm lg:hidden" onClick={() => setMenu(false)}>Close menu</button>}
          <PageHeader view={view} />
          {view === "overview" && <Overview {...ctx} />}
          {view === "new" && <NewGeneration {...ctx} />}
          {view === "brand" && <BrandView {...ctx} />}
          {view === "competitors" && <CompetitorView {...ctx} />}
          {view === "designs" && <DesignView {...ctx} />}
          {view === "seo" && <SeoView {...ctx} />}
          {view === "memory" && <MemoryView {...ctx} />}
          {view === "history" && <History {...ctx} />}
          {view === "publish" && <PublishView {...ctx} />}
          {view === "settings" && <Settings {...ctx} />}
        </main>
      </div>
    </div>
  );
}

function PageHeader({ view }: { view: ViewKey }) {
  const copy: Record<ViewKey, string> = {
    overview: "System status, integrations and the memory/novelty engine at a glance.",
    new: "Paste a public Shopify product URL to extract product + brand data, research competitors and generate four distinct designs.",
    brand: "Detected brand system. Edit anything — corrections persist and apply to the next generated pages.",
    competitors: "Evidence-backed competitor research. Discovered ≠ analyzed: only successfully crawled pages feed insights.",
    designs: "Four structurally different Shopify OS 2.0 landing pages with live responsive previews.",
    seo: "Rule-based SEO, AEO and GEO checklist with passed, failed, warning and not-applicable items.",
    memory: "Persistent category learnings, layout fingerprints and designer feedback used to plan every new generation.",
    history: "Previous generations, feedback decisions and publishing outcomes.",
    publish: "Publish to a Shopify development store via Admin GraphQL, or download the theme ZIP.",
    settings: "Credentials are read from server environment variables only — never exposed to the browser.",
  };
  const title = NAV.find((n) => n[0] === view)![1];
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">{copy[view]}</p>
    </div>
  );
}

function Overview({ overview, b, go }: any) {
  const o = overview;
  if (!o) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  const integ = o.integrations;
  const tiles = [
    ["Products analyzed", o.counts.products],
    ["Designs generated", o.counts.designs],
    ["Competitor pages analyzed", o.counts.competitors],
    ["Feedback signals", o.counts.feedback],
  ];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([l, v]) => (
          <Card key={l as string}><p className="text-sm text-slate-500">{l}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{v}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Integrations" subtitle="Everything is real — missing credentials are shown explicitly, never faked.">
          <ul className="space-y-3 text-sm">
            <Row label="Playwright / Chromium" ok={integ.browser.available} text={integ.browser.available ? "Available — computed styles and screenshots enabled." : `Unavailable (${integ.browser.error ?? "unknown"}). Falls back to HTML/CSS heuristics.`} />
            <Row label={`AI model (${integ.ai.provider})`} ok={integ.ai.provider !== "none"} text={integ.ai.note} warn />
            <Row label={`Search (${integ.search.provider})`} ok={integ.search.provider !== "none"} text={integ.search.note} warn />
            <Row label="Shopify Admin API" ok={integ.shopify.configured} text={integ.shopify.message} warn />
          </ul>
        </Card>
        <Card title="Novelty engine" subtitle={`Threshold ${o.novelty.threshold}/100 against all previous designs in the same category`}>
          <div className="space-y-2">
            {Object.entries(o.novelty.weights).map(([k, w]: any) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <span className="w-28 capitalize text-slate-600">{k.replace(/([A-Z])/g, " $1")}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${w * 100 * 3}%` }} /></div>
                <span className="w-10 text-right tabular-nums text-slate-500">{Math.round(w * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {!b ? (
        <Empty title="No active generation" action={<Btn onClick={() => go("new")}>Start a generation</Btn>}>Paste a Shopify product URL to begin. Previous runs are available under History.</Empty>
      ) : (
        <Card title={`Active: ${b.product.title}`} actions={<Btn variant="secondary" onClick={() => go("designs")}>Open designs</Btn>}>
          <JobProgress stages={b.run.stages} status={b.run.status} error={b.run.error} />
        </Card>
      )}
    </>
  );
}

function Row({ label, ok, text, warn }: { label: string; ok: boolean; text: string; warn?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <Badge tone={ok ? "green" : warn ? "amber" : "red"}>{ok ? "Ready" : warn ? "Needs key" : "Unavailable"}</Badge>
      <div><p className="font-medium text-slate-800">{label}</p><p className="text-slate-500">{text}</p></div>
    </li>
  );
}

function NewGeneration({ b, setRunId, go, reload, running }: any) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [action, setAction] = useState<string | null>(null);

  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api("/api/runs", { method: "POST", body: { url: url.trim() } });
      setRunId(r.runId);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const post = async (path: string, body?: unknown, name = path) => {
    setAction(name); setErr(null);
    try { await api(path, { method: "POST", body: body ?? {} }); await reload(); } catch (e) { setErr((e as Error).message); } finally { setAction(null); }
  };
  const newRun = async () => {
    setAction("newrun");
    try { const r = await api("/api/runs", { method: "POST", body: { productId: b.product.id } }); setRunId(r.runId); } catch (e) { setErr((e as Error).message); } finally { setAction(null); }
  };
  const p = b?.product?.data;
  const hasDesigns = b?.designs?.length > 0;
  const brandReady = !!b?.brand;

  return (
    <>
      <Card title="Product URL" subtitle="Public Shopify product page (https://store.com/products/handle). Localhost/private addresses are rejected.">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <input aria-label="Shopify product URL" className={inputCls} placeholder="https://brand.com/products/product-handle" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <Btn type="submit" busy={busy} disabled={!url}>Start AI analysis</Btn>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Try:
          {SAMPLE.map(([l, u]) => <button key={u} className="rounded-full bg-slate-100 px-2.5 py-1 hover:bg-slate-200" onClick={() => setUrl(u)}>{l}</button>)}
        </div>
        {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
      </Card>

      {b && (
        <>
          <Card title="Live job progress" subtitle={`Run #${b.run.runIndex} · ${b.run.category}`} actions={<Badge tone={running ? "indigo" : b.run.status === "error" ? "red" : "green"}>{b.run.status}</Badge>}>
            <JobProgress stages={b.run.stages} status={b.run.status} error={b.run.error} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Product" className="lg:col-span-2" actions={<a className="text-sm text-indigo-600 hover:underline" href={p.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>}>
              <div className="flex gap-4">
                {p.images[0] && <img src={`${p.images[0].src}${p.images[0].src.includes("?") ? "&" : "?"}width=240`} alt={p.images[0].alt ?? p.title} width={120} height={120} className="size-28 shrink-0 rounded-xl object-cover" />}
                <div className="min-w-0">
                  <h4 className="font-semibold">{p.title}</h4>
                  <p className="text-sm text-slate-500">{p.vendor} · {b.product.category}</p>
                  <p className="mt-2 text-lg font-semibold">{money(p.price, p.currency)} {p.compareAtPrice && <span className="ml-1 text-sm font-normal text-slate-400 line-through">{money(p.compareAtPrice, p.currency)}</span>} <span className="text-xs font-normal text-slate-500">{p.currency ?? "currency unknown"}</span></p>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">{p.description || "No description in source data."}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variants ({p.variants.length})</h5>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                    {p.variants.slice(0, 20).map((v: any) => <li key={v.id} className="flex justify-between gap-2"><span className="truncate">{v.title}</span><span className="flex items-center gap-2 text-slate-500"><code className="text-[11px]">{v.id}</code><Badge tone={v.available ? "green" : "red"}>{v.available ? "in stock" : "sold out"}</Badge></span></li>)}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">Options: {p.options.map((o: any) => `${o.name} (${o.values.length})`).join(", ") || "—"}</p>
                </div>
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Specifications ({p.specs.length})</h5>
                  {p.specs.length ? <dl className="mt-2 space-y-1 text-sm">{p.specs.slice(0, 8).map((s: any) => <div key={s.key} className="flex justify-between gap-3"><dt className="text-slate-500">{s.label}</dt><dd className="text-right font-medium">{s.value}</dd></div>)}</dl> : <p className="mt-2 text-sm text-slate-500">None found in source data — none invented.</p>}
                </div>
              </div>
            </Card>
            <Card title="Trust & evidence">
              <ul className="space-y-3 text-sm">
                <li><span className="font-medium">Reviews:</span> {p.reviews ? <Badge tone="green">{p.reviews.ratingValue}/5 · {p.reviews.reviewCount} (structured data)</Badge> : <Badge>none found — none shown</Badge>}</li>
                <li><span className="font-medium">Verified policies:</span> {p.policies.length ? <ul className="mt-1 space-y-1">{p.policies.map((x: any) => <li key={x.key} className="text-slate-600">• {x.label} <span className="text-xs text-slate-400">({x.source})</span></li>)}</ul> : <span className="text-slate-500">none in source data (COD/returns/delivery not claimed)</span>}</li>
                <li><span className="font-medium">Images:</span> {p.images.length}</li>
                <li><span className="font-medium">Sources:</span> {p.sources.join(", ")}</li>
              </ul>
              <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Extraction log</summary><ul className="mt-1 list-disc pl-4">{b.product.extractionLog.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul></details>
            </Card>
          </div>

          <Card title="Next steps" subtitle="Each step runs real jobs on the backend and persists to PostgreSQL.">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">1 · Competitor research</h4>
                <Field label="Optional: add competitor product URLs (one per line)" hint="Used in addition to Brave/SerpAPI discovery. robots.txt is respected.">
                  <textarea className={inputCls} rows={3} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://competitor.in/products/example" />
                </Field>
                <Btn busy={action === "research" || b.run.status === "researching"} disabled={running || !brandReady} onClick={() => post(`/api/runs/${b.run.id}/research`, { manualUrls: manual.split(/\s+/).filter(Boolean) }, "research")}>Run competitor research</Btn>
                <Btn variant="ghost" onClick={() => go("competitors")}>View research →</Btn>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">2 · Generate four designs</h4>
                {!brandReady && <Note>Waiting for brand analysis to finish…</Note>}
                {b.run.status !== "researched" && !hasDesigns && brandReady && <Note tone="indigo">You can generate now, but competitor insights make the memory engine smarter. Research first for best results.</Note>}
                {hasDesigns ? (
                  <>
                    <Note tone="green">This run already has {b.designs.length} designs. Generate again to see a visibly different set (new run, same product, edited brand preserved).</Note>
                    <div className="flex gap-2"><Btn busy={action === "newrun"} onClick={newRun}>New run for this product</Btn><Btn variant="secondary" onClick={() => go("designs")}>Open designs</Btn></div>
                  </>
                ) : (
                  <Btn busy={action === "generate" || b.run.status === "generating"} disabled={running || !brandReady} onClick={() => post(`/api/runs/${b.run.id}/generate`, {}, "generate")}>Generate 4 designs</Btn>
                )}
              </div>
            </div>
          </Card>
        </>
      )}
      {!b && !busy && <Empty title="Nothing analyzed yet">Start with a product URL above. You will see extraction results, brand settings, competitors and four generated designs.</Empty>}
    </>
  );
}

function History({ setRunId, go }: any) {
  const { data, error } = usePoll<any[]>(() => api("/api/runs"), false);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <Empty title="No history yet">Completed generations, feedback and publishing results appear here.</Empty>;
  return (
    <div className="space-y-4">
      {data.map((r) => (
        <Card key={r.id} title={`${r.title} · run #${r.runIndex}`} subtitle={`${new Date(r.createdAt).toLocaleString()} · ${r.category}`} actions={<><Badge tone={r.status === "completed" ? "green" : r.status === "error" ? "red" : "indigo"}>{r.status}</Badge><Btn variant="secondary" onClick={() => { setRunId(r.id); go("designs"); }}>Open</Btn></>}>
          {r.designs.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {r.designs.map((d: any) => (
                <div key={d.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-medium">{d.label}</p>
                  <p className="mt-1 text-xs text-slate-500">Novelty {d.novelty ?? "–"}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone={d.status === "approved" ? "green" : d.status === "rejected" ? "red" : "slate"}>{d.status}</Badge>
                    {d.publishes.map((p: any) => <Badge key={p.id} tone={p.status === "success" ? "green" : p.status === "blocked" ? "amber" : "red"}>publish: {p.status}</Badge>)}
                  </div>
                  {d.feedback.map((f: any) => <p key={f.id} className="mt-1 text-xs text-slate-500">{f.decision}{f.reason ? `: ${f.reason}` : ""}</p>)}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">No designs generated in this run.</p>}
        </Card>
      ))}
    </div>
  );
}

function Settings({ overview }: any) {
  const s = overview?.integrations;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Shopify connection" subtitle="Custom app created in your development store admin">
        {s ? <p className="text-sm text-slate-600">{s.shopify.message}{s.shopify.domain && <> Store: <code>{s.shopify.domain}</code> · API {s.shopify.apiVersion}</>}</p> : <Skeleton />}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Create a development store (Shopify Partners) and install a Dawn-based theme; duplicate it (unpublished).</li>
          <li>Settings → Apps → Develop apps → Create app → Admin API scopes: <code>read_themes, write_themes, read_products, write_products</code>.</li>
          <li>Install the app, copy the Admin API access token.</li>
          <li>Set <code>SHOPIFY_STORE_DOMAIN</code> and <code>SHOPIFY_ADMIN_TOKEN</code> in <code>.env</code>, restart.</li>
          <li>Import the same product into the dev store (matching handle) so the template can be assigned.</li>
        </ol>
      </Card>
      <Card title="AI & search">
        <ul className="space-y-2 text-sm text-slate-600">
          <li><b>AI:</b> <code>AI_PROVIDER</code> (gemini | openai), <code>AI_API_KEY</code>, <code>AI_MODEL</code>, optional <code>AI_BASE_URL</code> (any OpenAI-compatible endpoint).</li>
          <li><b>Search:</b> <code>BRAVE_API_KEY</code> or <code>SERPAPI_API_KEY</code> (+ <code>SEARCH_PROVIDER</code>).</li>
          <li><b>Status:</b> {s ? `AI=${s.ai.provider}, search=${s.search.provider}` : "…"}</li>
        </ul>
        <Note tone="indigo">Secrets live only in server environment variables. The browser never receives them.</Note>
      </Card>
    </div>
  );
}
