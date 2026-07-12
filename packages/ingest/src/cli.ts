import fs from "node:fs";
import { SCRATCH_DIR } from "./config.ts";
import { buildCubes } from "./cubes.ts";
import { ingestBaciDims, ingestBaciFacts } from "./providers/baci.ts";
import { fetchComtrade, transformComtrade } from "./providers/comtrade.ts";

const USAGE = `Usage: pnpm ingest <command> [args]

Commands:
  baci:dims                  Extract country + product dimensions from the BACI zip
  baci:facts                 Convert all BACI years to canonical Parquet facts
  cubes                      Build aggregate cubes from fact partitions
  baci:all                   dims + facts + cubes
  comtrade:fetch [year]      Fetch provisional chapter-level data (default 2025)
  comtrade:transform [year]  Transform fetched data into a provisional dataset
  comtrade:all [year]        fetch + transform
`;

async function main(): Promise<void> {
  await fs.promises.mkdir(SCRATCH_DIR, { recursive: true });
  const cmd = process.argv[2];
  const period = Number(process.argv[3] ?? 2025);
  switch (cmd) {
    case "baci:dims":
      await ingestBaciDims();
      break;
    case "baci:facts":
      await ingestBaciFacts();
      break;
    case "cubes":
      await buildCubes();
      break;
    case "baci:all":
      await ingestBaciDims();
      await ingestBaciFacts();
      await buildCubes();
      break;
    case "comtrade:fetch":
      await fetchComtrade(period);
      break;
    case "comtrade:transform":
      await transformComtrade(period);
      break;
    case "comtrade:all":
      await fetchComtrade(period);
      await transformComtrade(period);
      break;
    default:
      console.error(USAGE);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
