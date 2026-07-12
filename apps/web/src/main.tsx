import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router.tsx";
import { ThemeProvider } from "./theme.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data changes only on re-ingest; keep it fresh for the whole session.
      staleTime: 60 * 60 * 1000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
