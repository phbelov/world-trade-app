import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./layout/RootLayout.tsx";
import { CountryPage } from "./pages/CountryPage.tsx";

export const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/country/$iso3", params: { iso3: "USA" } });
  },
});

export interface CountrySearch {
  year?: number;
}

export const countryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/country/$iso3",
  validateSearch: (search: Record<string, unknown>): CountrySearch => {
    const y = Number(search.year);
    return Number.isInteger(y) && y >= 1900 && y <= 2100 ? { year: y } : {};
  },
  component: CountryPage,
});

const routeTree = rootRoute.addChildren([indexRoute, countryRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
