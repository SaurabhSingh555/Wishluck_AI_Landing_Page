import fs from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { assertSafeUrl, USER_AGENT } from "./safe-fetch";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const SHOT_DIR = path.join(DATA_DIR, "screenshots");

let browserPromise: Promise<Browser | null> | null = null;
let lastError: string | null = null;

export function browserStatus() {
  return { lastError };
}

/** Lazily launches Chromium via Playwright. Returns null (and records why) when unavailable. */
export async function getBrowser(): Promise<Browser | null> {
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        const { chromium } = await import("playwright-core");
        const b = await chromium.launch({
          executablePath: process.env.CHROMIUM_PATH || undefined,
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        });
        b.on("disconnected", () => {
          browserPromise = null;
        });
        return b;
      } catch (e) {
        lastError = (e as Error).message.split("\n")[0];
        browserPromise = null;
        return null;
      }
    })();
  }
  return browserPromise;
}

export interface PageSession {
  page: Page;
  context: BrowserContext;
}

/** Opens a page with SSRF protection on navigations. Callback result is returned; null if no browser. */
export async function withPage<T>(
  url: string,
  opts: { mobile?: boolean; timeoutMs?: number },
  fn: (s: PageSession) => Promise<T>,
): Promise<T | null> {
  const browser = await getBrowser();
  if (!browser) return null;
  await assertSafeUrl(url);
  const context = await browser.newContext({
    userAgent: opts.mobile
      ? `${USER_AGENT} Mobile`
      : USER_AGENT,
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
  });
  try {
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.isNavigationRequest()) {
        try {
          await assertSafeUrl(req.url());
        } catch {
          return route.abort("blockedbyclient");
        }
      }
      const type = req.resourceType();
      if (type === "media") return route.abort();
      return route.continue();
    });
    page.setDefaultTimeout(opts.timeoutMs ?? 20000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs ?? 25000 });
    await page.waitForLoadState("load", { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    return await fn({ page, context });
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function saveShot(page: Page, name: string, fullPage = false): Promise<string | null> {
  try {
    await fs.mkdir(SHOT_DIR, { recursive: true });
    const file = `${name}.jpg`;
    await page.screenshot({ path: path.join(SHOT_DIR, file), type: "jpeg", quality: 70, fullPage: fullPage ? true : false, timeout: 15000 });
    return file;
  } catch {
    return null;
  }
}
