"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { api, Badge, Btn, Card, Empty, ErrorNote, Field, inputCls, Note, ScoreRing, Skeleton, usePoll } from "./ui";

const NeedRun = ({ go, what }: { go: any; what: string }) => (
  <Empty title="No active run" action={<Btn onClick={() => go("new")}>Start a generation</Btn>}>{what}</Empty>
);

// ------------------------------------------------------------------ Brand
export function BrandView({ b, go, reload, overview }: any) {
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const brand = b?.brand?.data;
  useEffect(() => { if (brand) setForm(structuredClone(brand)); }, [b?.brand?.updatedAt, b?.brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return <NeedRun go={go} what="Analyze a product to see its detected brand system." />;
  if (!brand || !form) return <Card title="Brand analysis running"><div className="space-y-2"><Skeleton /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24" /></div></Card>;
  const fonts: any[] = overview?.fonts ?? [];
  const set = (path: string[], v: any) => setForm((f: any) => { const n = structuredClone(f); let o = n; path.slice(0, -1).forEach((k) => (o = o[k])); o[path[path.length - 1]] = v; return n; });
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await api(`/api/products/${b.product.id}/brand`, { method: "PUT", body: { name: form.name, tone: form.tone, colors: form.colors, fonts: { heading: form.fonts.heading, body: form.fonts.body, headingHandle: form.fonts.headingHandle, bodyHandle: form.fonts.bodyHandle }, visualStyle: { radius: Number(form.visualStyle.radius), spacing: form.visualStyle.spacing } } });
      setMsg({ ok: true, text: "Saved. These settings will be applied to your next generation (and regenerated designs)." });
      await reload();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };
  const reset = async () => { await api(`/api/products/${b.product.id}/brand`, { method: "POST" }); setMsg({ ok: true, text: "Reset to detected values." }); await reload(); };
  const colorKeys: Array<[string, string]> = [["primary", "Primary"], ["secondary", "Secondary"], ["background", "Background"], ["text", "Text"], ["button", "Button"], ["buttonText", "Button text"]];
  const fontOpts = (cur: string) => { const base = cur.replace(/_n\d$/, ""); return fonts.some((f) => f.handle === base) ? fonts : [{ family: base, handle: base }, ...fonts]; };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card title="Brand settings" subtitle={`Detected via ${brand.extractionMethod === "playwright-computed-styles" ? "Playwright computed styles" : "HTML/CSS heuristics (lower confidence)"}`} actions={b.brand.edited ? <Badge tone="indigo">edited by you</Badge> : <Badge>auto-detected</Badge>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand name"><input className={inputCls} value={form.name} onChange={(e) => set(["name"], e.target.value)} /></Field>
            <Field label="Tone of voice" hint={`Source: ${form.toneSource}`}><input className={inputCls} value={form.tone} onChange={(e) => set(["tone"], e.target.value)} /></Field>
          </div>
          <h4 className="mb-2 mt-5 text-sm font-semibold">Colors</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colorKeys.map(([k, l]) => (
              <Field key={k} label={l}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={`${l} picker`} className="size-9 cursor-pointer rounded-md border border-slate-300 bg-white p-0.5" value={form.colors[k]} onChange={(e) => set(["colors", k], e.target.value)} />
                  <input className={inputCls} aria-label={`${l} hex`} value={form.colors[k]} onChange={(e) => set(["colors", k], e.target.value)} />
                </div>
              </Field>
            ))}
          </div>
          <h4 className="mb-2 mt-5 text-sm font-semibold">Typography (Shopify font_picker handles)</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["headingHandle", "Heading font", "heading"], ["bodyHandle", "Body font", "body"]] as const).map(([k, l, nameKey]) => (
              <Field key={k} label={l} hint={form.fonts[nameKey === "heading" ? "headingFallback" : "bodyFallback"] ? `Detected "${form.fonts[nameKey]}" is not in Shopify's library — mapped to nearest.` : `Detected: ${form.fonts[nameKey]}`}>
                <div className="flex gap-2">
                  <select className={inputCls} value={form.fonts[k].replace(/_n\d$/, "")} onChange={(e) => { const w = form.fonts[k].match(/_n(\d)$/)?.[1] ?? "4"; set(["fonts", k], `${e.target.value}_n${w}`); set(["fonts", nameKey], fontOpts(form.fonts[k]).find((f: any) => f.handle === e.target.value)?.family ?? e.target.value); }}>
                    {fontOpts(form.fonts[k]).map((f: any) => <option key={f.handle} value={f.handle}>{f.family}</option>)}
                  </select>
                  <select aria-label={`${l} weight`} className={`${inputCls} w-28`} value={form.fonts[k].match(/_n(\d)$/)?.[1] ?? "4"} onChange={(e) => set(["fonts", k], `${form.fonts[k].replace(/_n\d$/, "")}_n${e.target.value}`)}>
                    <option value="4">Regular</option><option value="7">Bold</option>
                  </select>
                </div>
              </Field>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field label={`Corner radius: ${form.visualStyle.radius}px`}><input type="range" min={0} max={32} className="w-full" value={form.visualStyle.radius} onChange={(e) => set(["visualStyle", "radius"], Number(e.target.value))} /></Field>
            <Field label="Spacing density">
              <select className={inputCls} value={form.visualStyle.spacing} onChange={(e) => set(["visualStyle", "spacing"], e.target.value)}><option value="compact">Compact</option><option value="regular">Regular</option><option value="airy">Airy</option></select>
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Btn busy={busy} onClick={save}>Save brand settings</Btn>
            <Btn variant="secondary" onClick={reset}>Reset to detected</Btn>
            {msg && <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
          </div>
        </Card>
        <Card title="Live preview of brand tokens">
          <div className="rounded-xl p-6" style={{ background: form.colors.background, color: form.colors.text }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: form.colors.primary }}>{form.name}</p>
            <h4 className="mt-1 text-2xl font-bold" style={{ fontFamily: `'${form.fonts.heading}', sans-serif` }}>Headline in {form.fonts.heading}</h4>
            <p className="mt-1 text-sm opacity-80">Body copy in {form.fonts.body}. Tone: {form.tone}.</p>
            <button className="mt-4 px-5 py-2.5 text-sm font-semibold" style={{ background: form.colors.button, color: form.colors.buttonText, borderRadius: Number(form.visualStyle.radius) }}>Add to cart</button>
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Computed typography & buttons">
          <dl className="space-y-1.5 text-sm">
            {[["H1", `${brand.typography.h1Size} / ${brand.typography.h1Weight}`], ["H2", brand.typography.h2Size], ["Body", `${brand.typography.bodySize} / ${brand.typography.bodyWeight}`], ["Button radius", brand.button.radius], ["Button padding", `${brand.button.paddingY} ${brand.button.paddingX}`], ["Button text", `${brand.button.textTransform}, ${brand.button.fontWeight}`], ["Style", brand.visualStyle.style]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
          {brand.notes?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-500">{brand.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>}
        </Card>
        <Card title="Screenshots of source page">
          {b.product.screenshots?.desktop ? (
            <div className="space-y-3">
              <img src={`/api/files/${b.product.screenshots.desktop}`} alt="Desktop screenshot of the source product page" className="w-full rounded-lg border border-slate-200" loading="lazy" />
              {b.product.screenshots.mobile && <img src={`/api/files/${b.product.screenshots.mobile}`} alt="Mobile screenshot of the source product page" className="mx-auto w-40 rounded-lg border border-slate-200" loading="lazy" />}
            </div>
          ) : <p className="text-sm text-slate-500">No screenshots (browser unavailable or capture failed).</p>}
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Competitors
const statusTone: any = { crawled: "green", discovered: "slate", blocked_by_robots: "amber", failed: "red" };
export function CompetitorView({ b, go }: any) {
  const [open, setOpen] = useState<string | null>(null);
  if (!b) return <NeedRun go={go} what="Run competitor research to see discovered pages, screenshots and evidence-backed insights." />;
  const comps: any[] = b.competitors;
  const crawled = comps.filter((c) => c.status === "crawled");
  const stage = b.run.stages.find((s: any) => s.key === "discover");
  if (!comps.length) {
    return (
      <>
        {stage?.status === "blocked" && <Note>{stage.message}</Note>}
        {b.run.status === "researching" && <Card title="Researching…"><Skeleton className="h-24" /></Card>}
        {b.run.status !== "researching" && <Empty title="No competitor research yet" action={<Btn onClick={() => go("new")}>Go to research step</Btn>}>Research discovers candidates via Brave/SerpAPI (or manual URLs), checks robots.txt, crawls and analyzes each page.</Empty>}
      </>
    );
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Discovered", comps.length, "slate"], ["Successfully analyzed", crawled.length, "green"], ["Blocked by robots.txt", comps.filter((c) => c.status === "blocked_by_robots").length, "amber"], ["Failed", comps.filter((c) => c.status === "failed").length, "red"]].map(([l, v]) => (
          <Card key={l as string}><p className="text-sm text-slate-500">{l}</p><p className="mt-1 text-3xl font-semibold">{v}</p></Card>
        ))}
      </div>
      {crawled.length < 8 && <Note>Only {crawled.length} of the required 8 pages could be analyzed. Insights below are computed from {crawled.length} page(s) and are labelled accordingly. {b.run.stages.find((s: any) => s.key === "crawl")?.message}</Note>}
      <Card title="Evidence-backed insights" subtitle={`Computed from ${crawled.length} successfully analyzed page(s). Every statement links to its supporting pages.`}>
        {b.learnings.length ? (
          <ul className="divide-y divide-slate-100">
            {b.learnings.filter((l: any) => l.supporting > 0).map((l: any) => (
              <li key={l.id} className="py-3">
                <p className="text-sm font-medium text-slate-900">{l.statement}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">{l.evidenceUrls.map((u: string) => <a key={u} className="text-indigo-600 hover:underline" href={u} target="_blank" rel="noreferrer">{new URL(u).hostname.replace("www.", "")} ↗</a>)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">No insights yet.</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {comps.map((c) => {
          const o = c.observation;
          return (
            <Card key={c.id} title={c.domain} subtitle={c.rationale} actions={<Badge tone={statusTone[c.status]}>{c.status.replace(/_/g, " ")}</Badge>}>
              <a href={c.url} target="_blank" rel="noreferrer" className="break-all text-xs text-indigo-600 hover:underline">{c.url}</a>
              {c.failureReason && <p className="mt-2 text-sm text-slate-500">Reason: {c.failureReason}</p>}
              {c.status === "crawled" && (
                <>
                  <div className="mt-3 flex gap-3">
                    {c.screenshots.desktop ? <img src={`/api/files/${c.screenshots.desktop}`} alt={`${c.domain} desktop screenshot`} className="h-36 w-2/3 rounded-lg border border-slate-200 object-cover object-top" loading="lazy" /> : <div className="grid h-36 w-2/3 place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">no screenshot</div>}
                    {c.screenshots.mobile ? <img src={`/api/files/${c.screenshots.mobile}`} alt={`${c.domain} mobile screenshot`} className="h-36 w-1/4 rounded-lg border border-slate-200 object-cover object-top" loading="lazy" /> : null}
                  </div>
                  {o && (
                    <>
                      <p className="mt-3 flex flex-wrap items-center gap-1 text-xs">{o.sectionOrder.map((s: string, i: number) => <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5">{s}</span>)}</p>
                      <button className="mt-2 text-sm font-medium text-indigo-600" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>{open === c.id ? "Hide" : "Show"} observations</button>
                      {open === c.id && (
                        <dl className="mt-2 space-y-1 text-sm">
                          {[["Hero", o.heroStyle], ["Headline strategy", o.headline ? `${o.headline.strategy} (${o.headline.wordCount} words)` : "—"], ["Offer", `compare-at: ${o.offer.compareAtShown ? "yes" : "no"}, discount message: ${o.offer.discountBadge ? "yes" : "no"}, EMI/BNPL: ${o.offer.emiOrBnpl ? "yes" : "no"}`], ["CTA", `${o.cta.count} found, first at ${o.cta.firstPositionPct ?? "?"}% of DOM, sticky: ${o.cta.stickyAtc ? "yes" : "no"}`], ["Trust signals", o.trustSignals.join(", ") || "none detected"], ["Reviews", `${o.reviews.widgetDetected ? `widget${o.reviews.app ? ` (${o.reviews.app})` : ""}` : "none"}, near price: ${o.reviews.nearPricing ? "yes" : "no"}`], ["Media", `${o.media.images} images, ${o.media.videos} videos`], ["FAQ", o.faq.present ? `yes (${o.faq.detailsCount} accordions)` : "no"], ["Mobile", `sticky ATC: ${o.mobile.stickyAtc ? "yes" : "no"}, COD/UPI: ${o.mobile.codOrUpi ? "yes" : "no"}, WhatsApp: ${o.mobile.whatsapp ? "yes" : "no"}`], ["USP approach", o.usp.join(", ") || "—"]].map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-slate-500">{k}</dt><dd>{v}</dd></div>)}
                          {o.limitations.length > 0 && <p className="pt-1 text-xs text-amber-700">Limitations: {o.limitations.join(" ")}</p>}
                        </dl>
                      )}
                    </>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Design studio
const DEVICES: Array<[string, number]> = [["Mobile 360", 360], ["Tablet 768", 768], ["Desktop 1440", 1440]];

function DevicePreview({ id }: { id: string }) {
  const [w, setW] = useState(360);
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(700);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, cw / w);
  const H = 780;
  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Device preview width">
        {DEVICES.map(([l, px]) => <button key={px} role="tab" aria-selected={w === px} onClick={() => setW(px)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${w === px ? "bg-white shadow-sm" : "text-slate-600"}`}>{l}</button>)}
      </div>
      <div ref={box} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ height: H * scale }}>
        <iframe title={`Design preview at ${w}px`} src={`/preview/${id}`} style={{ width: w, height: H, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, background: "#fff", display: "block", margin: scale < 1 ? 0 : "0 auto" }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">Rendered from the generated Liquid sections with the real product data ({w}px viewport{scale < 1 ? `, scaled ${Math.round(scale * 100)}%` : ""}). <a className="text-indigo-600 hover:underline" href={`/preview/${id}`} target="_blank" rel="noreferrer">Open full page ↗</a></p>
    </div>
  );
}

export function DesignView({ b, go, designId, setDesignId, reload, setRunId }: any) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reject, setReject] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [lh, setLh] = useState<any>(null);
  const [exp, setExp] = useState({ a: "", b: "", split: 50, name: "Landing page A/B" });
  if (!b) return <NeedRun go={go} what="Generate a run to see four distinct landing page designs." />;
  const designs: any[] = b.designs;
  if (!designs.length) {
    const g = b.run.stages.find((s: any) => s.key === "generate");
    return b.run.status === "generating" ? (
      <Card title="Generating designs…" subtitle={g?.message}><div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}</div></Card>
    ) : <Empty title="No designs yet" action={<Btn onClick={() => go("new")}>Go to generation</Btn>}>Complete the analysis and generate four designs.</Empty>;
  }
  const sel = designs.find((d) => d.id === designId) ?? designs[0];
  const lighthouse = lh ?? sel.audits.lighthouse;
  const run = async (name: string, fn: () => Promise<any>) => { setBusy(name); setErr(null); try { await fn(); await reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } };
  const feedback = (id: string, decision: string) => run(`fb-${id}`, async () => { await api(`/api/designs/${id}/feedback`, { method: "POST", body: { decision, reason: decision === "rejected" ? reason || undefined : undefined } }); setReject(null); setReason(""); });
  const regen = (id: string) => run(`rg-${id}`, async () => { const r = await api(`/api/designs/${id}/regenerate`, { method: "POST", body: {} }); setDesignId(r.designId); });
  const doLh = (form: string) => run("lh", async () => { setLh(await api(`/api/designs/${sel.id}/lighthouse`, { method: "POST", body: { form } })); });
  const nd = sel.noveltyDetail;
  const blurbs: any = { story: "Editorial hero, product story, emotional benefits", benefit: "Bold value proposition, feature grid, comparison, FAQs", proof: "Evidence & reviews first — honest when no reviews exist", offer: "Factual price & offer first, conversion-focused" };

  return (
    <>
      {err && <ErrorNote>{err}</ErrorNote>}
      {b.run.status === "generating" && <Note tone="indigo">Generating…</Note>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {designs.map((d) => (
          <button key={d.id} onClick={() => setDesignId(d.id)} aria-pressed={d.id === sel.id} className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${d.id === sel.id ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-2"><p className="font-semibold">{d.label}</p><Badge tone={d.status === "approved" ? "green" : d.status === "rejected" ? "red" : "slate"}>{d.status}</Badge></div>
            <p className="mt-1 text-xs text-slate-500">{blurbs[d.archetype]}</p>
            <div className="mt-3 flex items-center gap-3"><ScoreRing value={d.noveltyScore} label="Novelty" size={64} /><div className="text-xs text-slate-500"><p>{d.plan.hero.layout}</p><p>{d.plan.sections.length} sections · {d.attempts} plan attempt(s)</p><p>copy: {d.copySource}</p></div></div>
          </button>
        ))}
      </div>

      <Card title={sel.label} subtitle={`Template suffix: ${sel.templateSuffix}`} actions={
        <>
          <Btn variant="secondary" busy={busy === `fb-${sel.id}`} onClick={() => feedback(sel.id, "approved")}>✓ Approve</Btn>
          <Btn variant="danger" onClick={() => setReject(reject ? null : sel.id)}>✕ Reject</Btn>
          <Btn variant="secondary" busy={busy === `rg-${sel.id}`} onClick={() => regen(sel.id)}>↻ Regenerate</Btn>
          <Btn variant="secondary" href={`/api/designs/${sel.id}/zip`} download>⬇ ZIP</Btn>
          <Btn onClick={() => go("publish")}>Publish…</Btn>
        </>
      }>
        {reject === sel.id && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl bg-rose-50 p-3 sm:flex-row sm:items-end">
            <Field label="Why reject? (optional — used by the planner)"><select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">No reason</option><option>hero too generic</option><option>colors off-brand</option><option>typography / fonts</option><option>CTA style</option><option>too similar to a previous design</option><option>layout too busy</option></select></Field>
            <Btn variant="danger" busy={busy === `fb-${sel.id}`} onClick={() => feedback(sel.id, "rejected")}>Confirm rejection</Btn>
          </div>
        )}
        {sel.feedback.length > 0 && <p className="mb-3 text-xs text-slate-500">Last feedback: {sel.feedback[0].decision}{sel.feedback[0].reason ? ` — ${sel.feedback[0].reason}` : ""}</p>}
        {sel.warnings.length > 0 && <div className="mb-3 space-y-1">{sel.warnings.map((w: string, i: number) => <Note key={i}>{w}</Note>)}</div>}
        <DevicePreview id={sel.id} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Novelty & closest historical design" subtitle={`Score ${nd?.score}/100 · threshold ${nd?.threshold} · compared against ${nd?.comparedAgainst} design(s)`} actions={<Badge tone={nd?.belowThreshold ? "amber" : "green"}>{nd?.belowThreshold ? "below threshold" : "passes threshold"}</Badge>}>
          {nd?.closest ? <p className="text-sm">Closest: <b>{nd.closest.label}</b> (distance {nd.closest.distance}) {nd.closest.runId === sel.runId ? "· same run" : "· earlier run"}</p> : <p className="text-sm text-slate-500">No history to compare — first design in this category.</p>}
          {nd?.components && Object.keys(nd.components).length > 0 && (
            <div className="mt-3 space-y-1.5">{Object.entries(nd.components).map(([k, v]: any) => <div key={k} className="flex items-center gap-3 text-xs"><span className="w-40 text-slate-600">{k}</span><div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${v}%` }} /></div><span className="w-8 text-right tabular-nums">{v}</span></div>)}</div>
          )}
          {nd?.differences?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-600">{nd.differences.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul>}
          <p className="mt-3 text-xs text-slate-500">Section sequence: {sel.plan.sections.map((s: any) => `${s.kind}(${s.layout})`).join(" → ")}</p>
        </Card>
        <Card title="Lighthouse (real audit)" subtitle="Runs Lighthouse against this design's preview URL in headless Chromium. Takes ~30–60s." actions={<><Btn variant="secondary" busy={busy === "lh"} onClick={() => doLh("mobile")}>Run mobile</Btn><Btn variant="secondary" busy={busy === "lh"} onClick={() => doLh("desktop")}>Run desktop</Btn></>}>
          {lighthouse ? (
            <>
              <div className="flex flex-wrap justify-around gap-3"><ScoreRing value={lighthouse.scores.performance} label="Performance" /><ScoreRing value={lighthouse.scores.accessibility} label="Accessibility" /><ScoreRing value={lighthouse.scores.seo} label="SEO" /><ScoreRing value={lighthouse.scores.bestPractices} label="Best practices" /></div>
              <p className="mt-3 text-xs text-slate-500">{lighthouse.form} · Lighthouse {lighthouse.lighthouseVersion} · LCP {lighthouse.metrics.lcp} · CLS {lighthouse.metrics.cls} · TBT {lighthouse.metrics.tbt} · FCP {lighthouse.metrics.fcp}</p>
              {lighthouse.failedAudits?.length > 0 && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Audits below target</summary><ul className="mt-1 list-disc pl-4">{lighthouse.failedAudits.map((a: any) => <li key={a.id}>{a.title}</li>)}</ul></details>}
            </>
          ) : <p className="text-sm text-slate-500">No Lighthouse result yet — run an audit. Scores are never estimated.</p>}
        </Card>
      </div>

      <Card title="A/B experiment (configuration)" subtitle="Pick two designs and store an experiment config. Shopify has no native traffic splitter; the config is included in the ZIP for use with an A/B tool.">
        <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <Field label="Name"><input className={inputCls} value={exp.name} onChange={(e) => setExp({ ...exp, name: e.target.value })} /></Field>
          <Field label="Design A"><select className={inputCls} value={exp.a} onChange={(e) => setExp({ ...exp, a: e.target.value })}><option value="">Select…</option>{designs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
          <Field label="Design B"><select className={inputCls} value={exp.b} onChange={(e) => setExp({ ...exp, b: e.target.value })}><option value="">Select…</option>{designs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
          <Field label={`Traffic to A: ${exp.split}%`}><input type="range" min={10} max={90} step={5} value={exp.split} onChange={(e) => setExp({ ...exp, split: Number(e.target.value) })} className="w-full" /></Field>
          <Btn busy={busy === "exp"} disabled={!exp.a || !exp.b || exp.a === exp.b} onClick={() => run("exp", () => api("/api/experiments", { method: "POST", body: { runId: b.run.id, designAId: exp.a, designBId: exp.b, name: exp.name, trafficSplit: exp.split } }))}>Save experiment</Btn>
        </div>
        {b.experiments.length > 0 && <ul className="mt-3 space-y-1 text-sm text-slate-600">{b.experiments.map((e: any) => <li key={e.id}>• {e.name}: {e.trafficSplit}% / {100 - e.trafficSplit}% · metric {e.primaryMetric} · <Badge>{e.status}</Badge></li>)}</ul>}
      </Card>
      <div className="flex justify-end"><Btn variant="ghost" onClick={() => { void setRunId; go("seo"); }}>View SEO/AEO/GEO breakdown →</Btn></div>
    </>
  );
}

// ------------------------------------------------------------------ SEO
const st: any = { pass: ["green", "Passed"], fail: ["red", "Failed"], warn: ["amber", "Warning"], na: ["slate", "N/A"] };
export function SeoView({ b, go, designId, setDesignId }: any) {
  if (!b) return <NeedRun go={go} what="Generate designs to see SEO/AEO/GEO audits." />;
  const designs: any[] = b.designs;
  if (!designs.length) return <Empty title="No designs to audit yet" />;
  const sel = designs.find((d) => d.id === designId) ?? designs[0];
  const seo = sel.audits.seo;
  const schema = sel.audits.schema;
  if (!seo) return <Skeleton className="h-40" />;
  return (
    <>
      <div className="flex flex-wrap gap-2">{designs.map((d) => <Btn key={d.id} variant={d.id === sel.id ? "primary" : "secondary"} onClick={() => setDesignId(d.id)}>{d.label.split("—")[0]}</Btn>)}</div>
      <Card title={`${sel.label} — score breakdown`} subtitle="Rule-based and explainable. Scores = (passed + 0.5 × warnings) / applicable checks. Not a ranking or rich-result guarantee.">
        <div className="flex flex-wrap justify-around gap-4"><ScoreRing size={96} value={seo.scores.seo} label="SEO" /><ScoreRing size={96} value={seo.scores.aeo} label="AEO" /><ScoreRing size={96} value={seo.scores.geo} label="GEO" /><ScoreRing size={96} value={sel.noveltyScore} label="Novelty" /></div>
      </Card>
      {(["SEO", "AEO", "GEO"] as const).map((g) => (
        <Card key={g} title={`${g} checklist`}>
          <ul className="divide-y divide-slate-100">
            {seo.items.filter((i: any) => i.group === g).map((i: any) => (
              <li key={i.id} className="flex items-start gap-3 py-2.5"><Badge tone={st[i.status][0]}>{st[i.status][1]}</Badge><div><p className="text-sm font-medium">{i.title}</p><p className="text-xs text-slate-500">{i.detail}</p></div></li>
            ))}
          </ul>
        </Card>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Structured data validation">
          <p className="text-sm">{seo.structuredData.blocks} JSON-LD block(s): {seo.structuredData.types.join(", ")}.</p>
          {seo.structuredData.errors.length > 0 ? <ErrorNote>{seo.structuredData.errors.join("; ")}</ErrorNote> : <p className="mt-1 text-sm text-emerald-700">All blocks parse; required Product fields verified by our own checker.</p>}
          <Note tone="indigo">Our checker validates syntax and required fields only. For Google&apos;s Rich Results Test evidence, publish the page and test its URL at <a className="underline" href="https://search.google.com/test/rich-results" target="_blank" rel="noreferrer">search.google.com/test/rich-results</a> (manual step — no result is claimed here).</Note>
        </Card>
        <Card title="Shopify theme validation" subtitle={schema ? `${schema.checks.filter((c: any) => c.ok).length}/${schema.checks.length} checks passed` : undefined}>
          {schema?.errors?.length ? <ul className="mb-2 list-disc pl-4 text-sm text-rose-700">{schema.errors.slice(0, 6).map((e: string, i: number) => <li key={i}>{e}</li>)}</ul> : <p className="text-sm text-emerald-700">Liquid syntax, section schemas, template JSON references and setting values all validated.</p>}
          <details className="text-xs text-slate-500"><summary className="cursor-pointer">All checks</summary><ul className="mt-1 max-h-48 overflow-auto">{schema?.checks.map((c: any, i: number) => <li key={i}>{c.ok ? "✓" : "✗"} {c.name}</li>)}</ul></details>
          <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Generated files ({sel.fileList.length})</summary><ul className="mt-1 max-h-48 overflow-auto font-mono">{sel.fileList.map((f: string) => <li key={f}>{f}</li>)}</ul></details>
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Memory
export function MemoryView({ b }: any) {
  const [cat, setCat] = useState<string | undefined>(undefined);
  const { data, error } = usePoll<any>(() => api(`/api/memory${cat ? `?category=${encodeURIComponent(cat)}` : ""}`), false, 2000, [cat, b?.designs?.length]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Skeleton className="h-40" />;
  if (!data.category) return <Empty title="Memory is empty">Generate designs and the engine will store fingerprints, learnings and feedback here.</Empty>;
  const byKey = new Map<string, any>();
  data.learnings.forEach((l: any) => { if (!byKey.has(l.key)) byKey.set(l.key, l); });
  return (
    <>
      <Card title="Category" actions={<select aria-label="Category" className={`${inputCls} w-56`} value={data.category} onChange={(e) => setCat(e.target.value)}>{data.categories.map((c: string) => <option key={c}>{c}</option>)}</select>}>
        <p className="text-sm text-slate-600">{data.designs.length} fingerprinted design(s), {data.feedback.length} feedback signal(s), {data.learnings.length} stored learning(s) for <b>{data.category}</b>. New generations compare against all of them, across runs and products in this category.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Reusable category learnings">
          {byKey.size ? <ul className="divide-y divide-slate-100">{[...byKey.values()].filter((l) => l.supporting > 0).slice(0, 12).map((l) => <li key={l.id} className="py-2 text-sm"><p>{l.statement}</p><p className="mt-0.5 flex flex-wrap gap-2 text-xs">{l.evidenceUrls.slice(0, 5).map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{new URL(u).hostname.replace("www.", "")}</a>)}</p></li>)}</ul> : <p className="text-sm text-slate-500">Run competitor research to create learnings.</p>}
        </Card>
        <Card title="Feedback log (used when planning)">
          {data.feedback.length ? <ul className="space-y-2 text-sm">{data.feedback.map((f: any) => <li key={f.id} className="flex items-center gap-2"><Badge tone={f.decision === "approved" ? "green" : "red"}>{f.decision}</Badge>{f.label}{f.reason && <span className="text-slate-500">— {f.reason}</span>}</li>)}</ul> : <p className="text-sm text-slate-500">No approve/reject decisions yet. Rejections down-weight the matching hero/layout choices in later plans.</p>}
        </Card>
      </div>
      <Card title="Stored layout fingerprints">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Design</th><th className="pr-3">Novelty</th><th className="pr-3">Hero</th><th className="pr-3">Sequence</th><th>Trust / offer</th></tr></thead><tbody className="divide-y divide-slate-100">
          {data.designs.map((d: any) => <tr key={d.id}><td className="py-2 pr-3 font-medium">{d.label.split("—")[0]} <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</span></td><td className="pr-3">{d.novelty}</td><td className="pr-3">{d.fingerprint.heroComposition.layout}</td><td className="pr-3 text-xs">{d.fingerprint.sectionSequence.join(" → ")}</td><td className="text-xs">{d.fingerprint.trustPlacement} / {d.fingerprint.offerPlacement}</td></tr>)}
        </tbody></table></div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ Publishing
export function PublishView({ b, go, designId, setDesignId, reload }: any) {
  const { data: shop, error } = usePoll<any>(() => api("/api/shopify/themes"), false);
  const [themeId, setThemeId] = useState("");
  const [assign, setAssign] = useState(false);
  const [updateSeo, setUpdateSeo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!b) return <NeedRun go={go} what="Generate designs first, then publish one to a development store." />;
  const designs: any[] = b.designs;
  const sel = designs.find((d) => d.id === designId) ?? designs[0];
  const publish = async () => {
    setBusy(true); setErr(null); setResult(null);
    try { setResult(await api(`/api/designs/${sel.id}/publish`, { method: "POST", body: { themeId, assignTemplate: assign, updateSeo } })); await reload(); }
    catch (e) { setErr((e as Error).message); setResult((e as any).data ?? null); await reload(); } finally { setBusy(false); }
  };
  const history = designs.flatMap((d) => d.publishes.map((p: any) => ({ ...p, label: d.label }))).sort((a, c) => +new Date(c.createdAt) - +new Date(a.createdAt));
  return (
    <>
      {error && <ErrorNote>{error}</ErrorNote>}
      {shop && !shop.configured && (
        <Note>
          <b>Awaiting Shopify credentials.</b> {shop.message} Publishing is fully implemented (Admin GraphQL <code>themeFilesUpsert</code>, read-back verification, <code>productUpdate</code>) but is blocked until a development store token is configured — see Settings. The ZIP fallback below always works.
        </Note>
      )}
      <Card title="Publish selected design" subtitle="Success is only reported after Shopify confirms and the uploaded files are read back and verified.">
        {designs.length === 0 ? <p className="text-sm text-slate-500">No designs yet.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Design"><select className={inputCls} value={sel.id} onChange={(e) => setDesignId(e.target.value)}>{designs.map((d) => <option key={d.id} value={d.id}>{d.label} ({d.templateSuffix})</option>)}</select></Field>
            <Field label="Target theme" hint="The live (published) theme is refused. Use an unpublished duplicate.">
              <select className={inputCls} value={themeId} onChange={(e) => setThemeId(e.target.value)} disabled={!shop?.configured}>
                <option value="">{shop?.configured ? "Select a theme…" : "Connect Shopify first"}</option>
                {shop?.themes?.map((t: any) => <option key={t.id} value={t.id} disabled={t.role === "MAIN"}>{t.name} — {t.role}{t.role === "MAIN" ? " (live, blocked)" : ""}</option>)}
              </select>
            </Field>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={assign} onChange={(e) => setAssign(e.target.checked)} /><span>Assign template <code>{sel.templateSuffix}</code> to product <code>{b.product.handle ?? b.product.data.handle}</code> in the store (requires the product to exist there).</span></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={updateSeo} disabled={!assign} onChange={(e) => setUpdateSeo(e.target.checked)} /><span>Also update the product&apos;s SEO title/description with the generated values.</span></label>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn busy={busy} disabled={!sel || !themeId || !shop?.configured} onClick={publish}>Publish to Shopify</Btn>
          {sel && <Btn variant="secondary" href={`/api/designs/${sel.id}/zip`} download>Download theme ZIP</Btn>}
        </div>
        {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
        {result?.steps && (
          <ol className="mt-4 space-y-2 text-sm">{result.steps.map((s: any, i: number) => <li key={i} className="flex items-start gap-2"><Badge tone={s.ok ? "green" : "red"}>{s.ok ? "ok" : "failed"}</Badge><div><b>{s.step}</b> — <span className="text-slate-600">{s.detail}</span></div></li>)}</ol>
        )}
        {result?.ok && result.previewUrl && (
          <div className="mt-4 flex flex-wrap gap-2"><Btn href={result.previewUrl}>Open store preview ↗</Btn><Btn variant="secondary" href={result.editorUrl}>Open theme editor ↗</Btn></div>
        )}
      </Card>
      <Card title="Publishing history">
        {history.length ? <ul className="divide-y divide-slate-100 text-sm">{history.map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2 py-2"><Badge tone={h.status === "success" ? "green" : h.status === "blocked" ? "amber" : "red"}>{h.status}</Badge>{h.label}<span className="text-slate-500">{new Date(h.createdAt).toLocaleString()}</span>{h.error && <span className="text-xs text-slate-500">— {h.error}</span>}{h.details?.previewUrl && <a className="text-indigo-600 hover:underline" href={h.details.previewUrl} target="_blank" rel="noreferrer">preview ↗</a>}</li>)}</ul> : <p className="text-sm text-slate-500">No publish attempts yet.</p>}
      </Card>
    </>
  );
}
