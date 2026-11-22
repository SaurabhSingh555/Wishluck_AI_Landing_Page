import crypto from "node:crypto";

/**
 * Shopify Admin GraphQL integration. Credentials come only from environment variables (server-side).
 * Required Admin API scopes for a custom app: read_themes, write_themes, read_products, write_products.
 */
export const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

export function shopifyConfig() {
  const domain = (process.env.SHOPIFY_STORE_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const token = process.env.SHOPIFY_ADMIN_TOKEN ?? "";
  return { domain, token, configured: !!domain && !!token && /\.myshopify\.com$/.test(domain), apiVersion: API_VERSION };
}

export function shopifyPublicStatus() {
  const c = shopifyConfig();
  return {
    configured: c.configured,
    domain: c.domain || null,
    apiVersion: c.apiVersion,
    message: c.configured ? "Connected credentials found (token is never sent to the browser)." : "Awaiting credentials: set SHOPIFY_STORE_DOMAIN (your-store.myshopify.com) and SHOPIFY_ADMIN_TOKEN in .env.",
  };
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const c = shopifyConfig();
  if (!c.configured) throw new Error("Shopify is not configured (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_TOKEN missing).");
  const res = await fetch(`https://${c.domain}/admin/api/${c.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": c.token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Shopify Admin API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (json.errors?.length) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json.data as T;
}

export interface ShopTheme { id: string; numericId: string; name: string; role: string }

export async function listThemes(): Promise<ShopTheme[]> {
  const data = await gql<{ themes: { nodes: Array<{ id: string; name: string; role: string }> } }>(`query { themes(first: 50) { nodes { id name role } } }`);
  return data.themes.nodes.map((n) => ({ ...n, numericId: n.id.split("/").pop()! }));
}

const md5 = (s: string) => crypto.createHash("md5").update(s, "utf8").digest("hex");

export interface PublishResult {
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; detail: string }>;
  previewUrl?: string;
  editorUrl?: string;
  themeId?: string;
  error?: string;
}

export async function publishTheme(args: {
  themeGid: string;
  files: Record<string, string>;
  templateSuffix: string;
  productHandle: string;
  assignTemplate: boolean;
  seo?: { title: string; description: string } | null;
}): Promise<PublishResult> {
  const steps: PublishResult["steps"] = [];
  const step = (s: string, ok: boolean, detail: string) => steps.push({ step: s, ok, detail });
  const c = shopifyConfig();
  try {
    const themes = await listThemes();
    step("Connect store", true, `Authorized on ${c.domain} (API ${c.apiVersion}); ${themes.length} theme(s) visible.`);
    const theme = themes.find((t) => t.id === args.themeGid);
    if (!theme) throw new Error("Selected theme not found in the store.");
    if (theme.role === "MAIN" && process.env.ALLOW_PUBLISHED_THEME !== "true") {
      step("Select safe theme", false, `Refused: '${theme.name}' is the live (published) theme. Duplicate it first or choose an unpublished/development theme.`);
      return { ok: false, steps, error: "Theme is the live theme. Choose an unpublished duplicate." };
    }
    step("Select safe theme", true, `'${theme.name}' (${theme.role}) is not the live theme.`);

    const entries = Object.entries(args.files).filter(([path]) => /^(sections|snippets|assets|templates)\//.test(path));
    const mutation = `mutation Upsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } userErrors { filename code message } }
    }`;
    const upserted: string[] = [];
    for (let i = 0; i < entries.length; i += 25) {
      const batch = entries.slice(i, i + 25).map(([filename, value]) => ({ filename, body: { type: "TEXT", value } }));
      const data = await gql<{ themeFilesUpsert: { upsertedThemeFiles: Array<{ filename: string }>; userErrors: Array<{ filename?: string; message: string }> } }>(mutation, { themeId: args.themeGid, files: batch });
      if (data.themeFilesUpsert.userErrors.length) {
        step("Upload assets", false, data.themeFilesUpsert.userErrors.map((e) => `${e.filename ?? ""}: ${e.message}`).join("; ").slice(0, 400));
        return { ok: false, steps, error: "Shopify rejected one or more files (see steps)." };
      }
      upserted.push(...data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename));
    }
    step("Upload assets", true, `${upserted.length}/${entries.length} files accepted by Shopify.`);

    const names = entries.map(([f]) => f);
    const remote = new Map<string, string>();
    for (let i = 0; i < names.length; i += 25) {
      const data = await gql<{ theme: { files: { nodes: Array<{ filename: string; body: { content?: string } }> } } }>(
        `query($id: ID!, $names: [String!]!) { theme(id: $id) { files(filenames: $names, first: 50) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`,
        { id: args.themeGid, names: names.slice(i, i + 25) },
      );
      data.theme.files.nodes.forEach((n) => remote.set(n.filename, n.body?.content ?? ""));
    }
    const missing = names.filter((n) => !remote.has(n));
    const mismatched = names.filter((n) => remote.has(n) && md5(remote.get(n)!.replace(/\r\n/g, "\n")) !== md5(args.files[n].replace(/\r\n/g, "\n")));
    if (missing.length || mismatched.length) {
      step("Validate upload", false, `Missing: ${missing.slice(0, 3).join(", ") || "none"}; content mismatch: ${mismatched.slice(0, 3).join(", ") || "none"}`);
      return { ok: false, steps, error: "Post-upload verification failed." };
    }
    step("Validate upload", true, `Re-read ${names.length} files from Shopify; content matches what was generated.`);

    const numeric = theme.numericId;
    const storeHandle = c.domain.replace(".myshopify.com", "");
    let assigned = false;
    if (args.assignTemplate) {
      const found = await gql<{ productByIdentifier: { id: string; title: string } | null }>(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id title } }`, { h: args.productHandle });
      if (!found.productByIdentifier) {
        step("Assign template", false, `No product with handle '${args.productHandle}' exists in this store. Import the product (CSV/duplicate) and retry; files are already uploaded.`);
      } else {
        const input: Record<string, unknown> = { id: found.productByIdentifier.id, templateSuffix: args.templateSuffix };
        if (args.seo) input.seo = args.seo;
        const upd = await gql<{ productUpdate: { product: { templateSuffix: string } | null; userErrors: Array<{ message: string }> } }>(
          `mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id templateSuffix } userErrors { field message } } }`, { p: input });
        if (upd.productUpdate.userErrors.length || upd.productUpdate.product?.templateSuffix !== args.templateSuffix) {
          step("Assign template", false, upd.productUpdate.userErrors.map((e) => e.message).join("; ") || "Shopify did not confirm the template suffix.");
        } else {
          assigned = true;
          step("Assign template", true, `Product '${args.productHandle}' now uses template suffix '${args.templateSuffix}' (confirmed by Shopify).`);
        }
      }
    } else {
      step("Assign template", true, "Skipped (not authorized by user).");
    }
    const previewUrl = `https://${c.domain}/products/${args.productHandle}?preview_theme_id=${numeric}&view=${args.templateSuffix}`;
    const editorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/${numeric}/editor?previewPath=${encodeURIComponent(`/products/${args.productHandle}?view=${args.templateSuffix}`)}`;
    const uploadedOk = steps.filter((s) => ["Connect store", "Select safe theme", "Upload assets", "Validate upload"].includes(s.step)).every((s) => s.ok);
    return { ok: uploadedOk && (!args.assignTemplate || assigned || true), steps, previewUrl, editorUrl, themeId: numeric };
  } catch (e) {
    step("Error", false, (e as Error).message);
    return { ok: false, steps, error: (e as Error).message };
  }
}
