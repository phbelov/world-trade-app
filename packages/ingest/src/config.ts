import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// Provider API keys live in the repo-root .env (gitignored).
try {
  process.loadEnvFile(path.join(REPO_ROOT, ".env"));
} catch {
  // no .env — fine, only API-fetching commands need it
}

export const COMTRADE_API_KEY = process.env.COMTRADE_API_KEY;

/** All data artifacts live outside git; overridable to point at another volume. */
export const DATA_DIR = process.env.WT_DATA_DIR ?? path.join(REPO_ROOT, "data");
export const RAW_DIR = path.join(DATA_DIR, "raw");
export const PARQUET_DIR = path.join(DATA_DIR, "parquet");
/** Scratch space for streaming single files out of source archives. */
export const SCRATCH_DIR = process.env.WT_SCRATCH_DIR ?? path.join(DATA_DIR, "tmp");

export const BACI_RELEASE = "202601";
export const BACI_DATASET_ID = `baci-hs92-${BACI_RELEASE}`;
export const BACI_ZIP = path.join(RAW_DIR, `BACI_HS92_V${BACI_RELEASE}.zip`);

/** Root for one immutable dataset version's query-optimized artifacts. */
export function datasetDir(datasetId: string): string {
  return path.join(PARQUET_DIR, datasetId);
}
