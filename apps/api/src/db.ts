import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export const DATA_DIR = process.env.WT_DATA_DIR ?? path.join(REPO_ROOT, "data");
export const PARQUET_DIR = path.join(DATA_DIR, "parquet");

/** True when reading Parquet over HTTPS (serverless) instead of local disk. */
export const REMOTE_DATA = Boolean(process.env.WT_DATA_BASE_URL) ||
  process.env.VERCEL === "1";

let conn: DuckDBConnection | null = null;
/** Serialize queries on one connection; every query here is milliseconds. */
let chain: Promise<unknown> = Promise.resolve();

export async function initDb(): Promise<void> {
  const instance = await DuckDBInstance.create(":memory:");
  conn = await instance.connect();
  if (REMOTE_DATA) {
    // Serverless: only /tmp is writable; httpfs enables read_parquet over https.
    await conn.run(`SET home_directory = '/tmp'`);
    await conn.run(`SET extension_directory = '/tmp/duckdb-extensions'`);
    await conn.run(`SET temp_directory = '/tmp/duckdb-spill'`);
    await conn.run(`SET memory_limit = '768MB'`);
    await conn.run(`SET threads = 2`);
    await conn.run(`INSTALL httpfs`);
    await conn.run(`LOAD httpfs`);
  } else {
    await conn.run(`SET memory_limit = '2GB'`);
    await conn.run(`SET threads = 4`);
  }
}

export function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const run = async (): Promise<T[]> => {
    if (!conn) throw new Error("db not initialized");
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjects() as never;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

export async function exec(sql: string): Promise<void> {
  await query(sql);
}
