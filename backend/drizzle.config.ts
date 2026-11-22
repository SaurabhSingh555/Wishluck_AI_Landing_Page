import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
    break;
  }
}

export default defineConfig({
  dialect: "mysql",
  schema: "./backend/src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/wishluck_studio" },
});
