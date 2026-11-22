export function clamp(n: number, a = 0, b = 255) {
  return Math.min(b, Math.max(a, n));
}

export function parseColor(input: string | null | undefined): [number, number, number, number] | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.every((n) => !Number.isNaN(n))) return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}

export function toHex(input: string | null | undefined, fallback = "#000000"): string {
  const c = parseColor(input);
  if (!c) return fallback;
  return "#" + c.slice(0, 3).map((n) => clamp(Math.round(n)).toString(16).padStart(2, "0")).join("");
}

export function isHex(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
}

export function luminance(hex: string): number {
  const c = parseColor(hex) ?? [0, 0, 0, 1];
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function readableOn(bg: string, light = "#ffffff", dark = "#111111"): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/** Ensure `fg` has >= 4.5:1 contrast on `bg`, otherwise fall back to black/white. */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  return contrast(fg, bg) >= min ? fg : readableOn(bg);
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a) ?? [0, 0, 0, 1];
  const cb = parseColor(b) ?? [0, 0, 0, 1];
  return "#" + [0, 1, 2].map((i) => clamp(Math.round(ca[i] * (1 - t) + cb[i] * t)).toString(16).padStart(2, "0")).join("");
}

export function saturation(hex: string): number {
  const c = parseColor(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
