import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./layout/RootLayout.tsx";
import { CountryPage } from "./pages/CountryPage.tsx";
import { PairPage } from "./pages/PairPage.tsx";
import { ProductPage } from "./pages/ProductPage.tsx";
import { WorldPage } from "./pages/WorldPage.tsx";
import { isMeasure, type Measure } from "./lib/measures.ts";

const yearSearch = (search: Record<string, unknown>): { year?: number } => {
  const y = Number(search.year);
  return Number.isInteger(y) && y >= 1900 && y <= 2100 ? { year: y } : {};
};

export const rootRoute = createRootRoute({ component: RootLayout });

export interface WorldSearch {
  year?: number;
  measure?: Measure;
  sel?: string;
}

export const worldRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): WorldSearch => {
    const out: WorldSearch = {};
    const y = Number(search.year);
    if (Number.isInteger(y) && y >= 1900 && y <= 2100) out.year = y;
    if (isMeasure(search.measure)) out.measure = search.measure;
    const sel = String(search.sel ?? "").toUpperCase();
    if (/^[A-Z]{3}$/.test(sel)) out.sel = sel;
    return out;
  },
  component: WorldPage,
});

export interface CountrySearch {
  year?: number;
}

export const countryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/country/$iso3",
  validateSearch: yearSearch,
  component: CountryPage,
});

export const pairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pair/$a/$b",
  validateSearch: yearSearch,
  component: PairPage,
});

export const productRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/product/$code",
  validateSearch: yearSearch,
  component: ProductPage,
});

const routeTree = rootRoute.addChildren([
  worldRoute,
  countryRoute,
  pairRoute,
  productRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
