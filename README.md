# World Trade Explorer

An economic-intelligence platform for exploring global trade flows between
countries: who trades with whom, in what products, for how much, and how those
relationships evolved since 1995.

Built on real international trade statistics — no mock data.

## Data

| | |
|---|---|
| Core dataset | [CEPII BACI](https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37) — UN Comtrade bilateral flows, mirror-reconciled by CEPII |
| Current release | `BACI_HS92_V202601` (published 2026-01-22), years **1995–2024** |
| Grain | exporter × importer × HS6 product × year; values in current USD, quantities in metric tonnes |
| Classification | HS92 (6-digit) internally — the only HS vintage expressible for every year since 1995, giving unbroken product time series |
| License | [Etalab 2.0 open license](https://www.etalab.gouv.fr/licence-ouverte-open-licence) — attribution required |
| Provisional years | UN Comtrade+ API adapter: latest year (2025) at **HS2 chapter grain** in reporters' native classification (chapters are revision-stable, so no concordance needed). Countries that reported use their own export declarations; non-reporters are mirror-estimated from partners' imports and flagged. Marked `provisional`/`unreconciled` — the UI renders these years visually distinct. |
| Planned adapters | IMF IMTS (monthly bilateral totals) |

Semantics preserved end-to-end: **a missing row means "no trade reported", a
null quantity means "tonnage unavailable" — neither is ever conflated with zero.**

## Architecture

Read-only OLAP over a ~330M-row dataset that changes about once a year, so:

```
BACI zip ──► provider adapter ──► canonical Parquet (zstd, hive-partitioned by year)
                                   ├── facts/year=YYYY/…      (full HS6 grain)
                                   ├── cubes/<name>/year=YYYY/… (precomputed aggregates)
                                   └── dims/ + manifest.json    (immutable dataset version)
                                          │
                              thin Hono API embedding DuckDB
                              (responses cached immutably per dataset version)
                                          │
                     React SPA — Vite · TanStack Router/Query · D3 · MapLibre+deck.gl
```

- **Monorepo**: `packages/shared` (canonical types, HS sections), `packages/ingest`
  (adapters, transforms, cubes, validation), `apps/api` (M1), `apps/web` (M1).
- **Providers are swappable at the ingestion boundary**: each adapter emits the
  canonical schema; everything downstream is provider-blind.
- **Dataset versions are immutable** (`baci-hs92-202601`); a new release is a
  new version and an atomic switch.
- Quantities are aggregated only at single-product grain — summing tonnes
  across products is physically meaningless.

## Running the pipeline

```sh
pnpm install
# download BACI zip (~2.4 GB) into data/raw/, then:
pnpm ingest baci:all        # dims + 30 years of facts + cubes  (~5 min)
pnpm ingest comtrade:all    # provisional latest year (needs COMTRADE_API_KEY in .env)
pnpm --filter @world-trade/ingest test   # correctness gate vs published figures
```

`WT_DATA_DIR` relocates all data artifacts (e.g. to another volume).
The Comtrade fetch is checkpointed per reporter and resumes cleanly if the
free-tier daily quota (500 calls) runs out; unchanged upstream datasets are
skipped on re-runs via Comtrade's own dataset checksums.

## Milestones

- **M0** — data foundation: ingest, cubes, validation *(current)*
- **M1** — API + country profile vertical slice
- **M2** — interactive world map, command palette, year scrubber
- **M3** — bilateral & product views
- **M4** — compare mode, dependency analytics, a11y/dark-mode polish
- **M5** — deployment, CDN caching, OG images
