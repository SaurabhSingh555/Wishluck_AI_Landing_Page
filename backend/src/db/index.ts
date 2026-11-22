import "../config/env";
import { randomUUID } from "node:crypto";
import { eq, type InferSelectModel, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import * as t from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and set your MySQL connection string.");
}

const globalForDb = globalThis as typeof globalThis & { __wishluckPool?: mysql.Pool };

export const pool =
  globalForDb.__wishluckPool ??
  mysql.createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__wishluckPool = pool;

export const db = drizzle(pool, { schema: t, mode: "default" });

/** MySQL has no RETURNING: insert with an explicit UUID, then read the row back. */
export async function insertAndGet<T extends MySqlTable>(table: T, values: Record<string, unknown>): Promise<InferSelectModel<T>> {
  const idValue = randomUUID();
  await db.insert(table).values({ ...values, id: idValue } as never);
  const idColumn = (table as unknown as { id: SQL }).id;
  const [row] = await db.select().from(table).where(eq(idColumn, idValue)).limit(1);
  return row as InferSelectModel<T>;
}
