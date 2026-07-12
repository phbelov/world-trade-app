import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, PARQUET_DIR } from "./config.ts";
import { withDuck } from "./duck.ts";

/**
 * Stage data for the public release: GitHub release assets are flat files,
 * so each cube is consolidated into ONE all-years Parquet (year column baked
 * in from the hive path) and facts keep one file per year, flat-named.
 * Output goes to data/deploy/.
 */
export async function stageDeployData(): Promise<void> {
  const out = path.join(DATA_DIR, "deploy");
  await fs.promises.rm(out, { recursive: true, force: true });
  await fs.promises.mkdir(out, { recursive: true });

  const datasetIds = (await fs.promises.readdir(PARQUET_DIR)).filter((d) =>
    fs.existsSync(path.join(PARQUET_DIR, d, "manifest.json")),
  );

  const manifests: unknown[] = [];
  await withDuck(async (db) => {
    for (const id of datasetIds) {
      const root = path.join(PARQUET_DIR, id);
      manifests.push(
        JSON.parse(await fs.promises.readFile(path.join(root, "manifest.json"), "utf8")),
      );

      for (const cube of await fs.promises.readdir(path.join(root, "cubes"))) {
        const t0 = Date.now();
        await db.exec(`
          COPY (
            SELECT * FROM read_parquet(
              '${path.join(root, "cubes", cube, "*", "*.parquet")}',
              hive_partitioning = true)
          ) TO '${path.join(out, `cube-${id}-${cube}.parquet`)}'
          (FORMAT parquet, COMPRESSION zstd)
        `);
        console.log(`cube-${id}-${cube} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }

      for (const dim of ["countries", "products"]) {
        const src = path.join(root, "dims", `${dim}.parquet`);
        if (fs.existsSync(src)) {
          await fs.promises.copyFile(src, path.join(out, `dims-${id}-${dim}.parquet`));
        }
      }

      // Facts stay per-year so remote queries fetch only one year's file.
      for (const factsDir of ["facts", "facts_hs2"]) {
        const factsRoot = path.join(root, factsDir);
        if (!fs.existsSync(factsRoot)) continue;
        for (const part of await fs.promises.readdir(factsRoot)) {
          const year = /^year=(\d{4})$/.exec(part)?.[1];
          if (!year) continue;
          await fs.promises.copyFile(
            path.join(factsRoot, part, "data.parquet"),
            path.join(out, `facts-${id}-${year}.parquet`),
          );
        }
      }
    }
  });

  await fs.promises.writeFile(
    path.join(out, "datasets.json"),
    JSON.stringify(manifests, null, 2),
  );
  const files = await fs.promises.readdir(out);
  console.log(`staged ${files.length} assets in ${out}`);
}
