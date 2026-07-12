import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { initCatalog } from "./datasets.ts";
import { initDb } from "./db.ts";

const PORT = Number(process.env.PORT ?? 8787);

async function main(): Promise<void> {
  await initDb();
  const catalog = await initCatalog();
  console.log(
    `datasets: ${catalog.datasets.map((d) => d.id).join(", ")} — years ${catalog.years[0]?.year}–${catalog.years.at(-1)?.year}`,
  );
  const app = createApp();
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`api listening on http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
