import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { CommandPalette } from "../components/CommandPalette.tsx";
import { fetchMeta } from "../lib/api.ts";
import { useTheme } from "../theme.tsx";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="rounded border border-line px-2.5 py-1.5 text-sm text-ink-muted hover:text-ink hover:border-line-strong transition-colors"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

export function RootLayout() {
  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/" className="shrink-0">
              <span className="font-display text-2xl font-semibold tracking-tight">
                World Trade
              </span>
              <span className="ml-2 hidden text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted md:inline">
                Explorer
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm" aria-label="Main">
              <Link
                to="/"
                className="text-ink-muted hover:text-ink"
                activeOptions={{ exact: true }}
                activeProps={{ className: "font-medium text-ink" }}
              >
                Map
              </Link>
              <Link
                to="/compare"
                className="text-ink-muted hover:text-ink"
                activeProps={{ className: "font-medium text-ink" }}
              >
                Compare
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <CommandPalette />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-6 text-xs leading-relaxed text-ink-muted">
          <p>
            Reconciled bilateral trade data: CEPII BACI (HS92), Etalab 2.0
            license. Provisional latest year: UN Comtrade, unreconciled
            declarations. Country boundaries: Natural Earth. Values in current
            US dollars.
          </p>
          {meta.data && (
            <p className="mt-1">
              Datasets: {meta.data.datasets.map((d) => d.id).join(" · ")}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
