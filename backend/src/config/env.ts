import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
    break;
  }
}
