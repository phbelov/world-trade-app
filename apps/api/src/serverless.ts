/**
 * Serverless composition root: the whole API behind a lazy per-instance
 * initialization gate. Bundled to api-dist/server.mjs at build time (see
 * vercel.json) so the function entry has no TypeScript imports to resolve.
 */
import { Hono } from "hono";
import { createApp } from "./app.ts";
import { initCatalog } from "./datasets.ts";
import { initDb } from "./db.ts";

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

export const app = new Hono();
app.use("*", async (_c, next) => {
  await ensureInit();
  await next();
});
app.route("/", createApp());
