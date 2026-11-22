"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type ReactNode } from "react";

export async function api<T = any>(url: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: opts?.method ?? "GET",
    headers: opts?.body ? { "content-type": "application/json" } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { data });
  return data as T;
}

export function Card({ title, subtitle, actions, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)] ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};
export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Btn({ children, onClick, variant = "primary", disabled, busy, href, className = "", type = "button", download }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; busy?: boolean; href?: string; className?: string; type?: "button" | "submit"; download?: boolean }) {
  const cls = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/30",
    secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
    danger: "bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  const base = `inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${className}`;
  if (href) return <a href={href} className={base} download={download ? true : undefined} target={download ? undefined : "_blank"} rel="noreferrer">{children}</a>;
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} className={base} aria-busy={busy}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-indigo-50 text-indigo-600">✦</div>
      <h4 className="font-semibold text-slate-900">{title}</h4>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{children}</div>;
}
export function Note({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "indigo" | "green" }) {
  const c = { amber: "border-amber-200 bg-amber-50 text-amber-900", indigo: "border-indigo-200 bg-indigo-50 text-indigo-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export function ScoreRing({ value, label, size = 76 }: { value: number | null | undefined; label: string; size?: number }) {
  const v = value ?? 0;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const color = value == null ? "#cbd5e1" : v >= 90 ? "#059669" : v >= 70 ? "#d97706" : "#e11d48";
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`${label}: ${value == null ? "not available" : v}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .8s ease" }} />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-900 text-[17px] font-semibold">{value == null ? "–" : Math.round(v)}</text>
      </svg>
      <span className="text-xs font-medium text-slate-500">{label}</span>
    </div>
  );
}

export function usePoll<T>(fn: () => Promise<T>, active: boolean, ms = 2000, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    if (!active) return;
    const h = setInterval(load, ms);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ms, ...deps]);
  return { data, error, reload: load, setData };
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
export const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function JobProgress({ stages, status, error }: { stages: any[]; status?: string; error?: string | null }) {
  if (!stages?.length) return null;
  const icon = (s: string) => (s === "done" ? "✓" : s === "running" ? "" : s === "error" ? "!" : s === "blocked" ? "⏸" : s === "skipped" ? "–" : "·");
  return (
    <ol className="space-y-2" aria-label="Job progress" aria-live="polite">
      {stages.map((s) => (
        <li key={s.key} className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.status === "done" ? "bg-emerald-100 text-emerald-700" : s.status === "running" ? "bg-indigo-100 text-indigo-700" : s.status === "error" ? "bg-rose-100 text-rose-700" : s.status === "blocked" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
            {s.status === "running" ? <Spinner /> : icon(s.status)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{s.label}</p>
            {s.message && <p className="text-xs text-slate-500">{s.message}</p>}
          </div>
        </li>
      ))}
      {status === "error" && error && <ErrorNote>{error}</ErrorNote>}
    </ol>
  );
}
