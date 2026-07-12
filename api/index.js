/**
 * Vercel function entry — plain JS so the runtime resolves everything
 * directly: the API itself is prebundled into api-dist/server.mjs during
 * the build (esbuild, see vercel.json), with only DuckDB's native package
 * left external for the file tracer to pick up from node_modules.
 */
import { handle } from "hono/vercel";
import { app } from "../api-dist/server.mjs";

export const config = {
  maxDuration: 60,
};

export default handle(app);
