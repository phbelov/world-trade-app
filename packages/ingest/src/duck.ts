import { DuckDBInstance } from "@duckdb/node-api";
import { SCRATCH_DIR } from "./config.ts";

export interface Duck {
  /** Run a statement, discarding results. */
  exec(sql: string): Promise<void>;
  /** Run a query, returning rows as plain objects. */
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
}

/**
 * Open an in-memory DuckDB tuned for a nearly-full disk: bounded memory so
 * large aggregations spill predictably, and spill directed at our scratch dir
 * so it is visible and cleaned up with it.
 */
export async function withDuck<T>(fn: (db: Duck) => Promise<T>): Promise<T> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  const db: Duck = {
    async exec(sql) {
      await conn.run(sql);
    },
    async query(sql) {
      const reader = await conn.runAndReadAll(sql);
      return reader.getRowObjects() as never;
    },
  };
  try {
    await db.exec(`SET memory_limit = '3GB'`);
    await db.exec(`SET threads = 4`);
    await db.exec(`SET temp_directory = '${SCRATCH_DIR}/duckdb-spill'`);
    await db.exec(`SET preserve_insertion_order = false`);
    return await fn(db);
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}
