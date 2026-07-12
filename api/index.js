/**
 * Vercel function entry — plain JS so the runtime resolves everything
 * directly: the API itself is prebundled into api-dist/server.mjs during
 * the build (esbuild, see vercel.json), with only DuckDB's native package
 * left external for the file tracer to pick up from node_modules.
 *
 * Named HTTP-method exports (web fetch signature): the runtime ignores
 * Response objects returned from a default export.
 */
import { handle } from "hono/vercel";
import { app } from "../api-dist/server.mjs";

export const config = {
  maxDuration: 60,
};

const handler = handle(app);

export const GET = handler;
export const HEAD = handler;
export const OPTIONS = handler;
