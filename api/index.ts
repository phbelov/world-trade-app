/**
 * Vercel serverless entry: the whole Hono API behind /api/*, reading Parquet
 * over HTTPS (see apps/api/src/datasets.ts). Initialization (DuckDB + httpfs
 * + view creation) happens once per warm instance.
 */
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createApp } from "../apps/api/src/app.ts";
import { initCatalog } from "../apps/api/src/datasets.ts";
import { initDb } from "../apps/api/src/db.ts";

export const config = {
  maxDuration: 60,
};

let ready: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  ready ??= (async () => {
    await initDb();
    await initCatalog();
  })().catch((err) => {
    ready = null; // allow retry on next invocation
    throw err;
  });
  return ready;
}

const outer = new Hono();
outer.use("*", async (_c, next) => {
  await ensureInit();
  await next();
});
outer.route("/", createApp());

export default handle(outer);
