import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { fetchMeta } from "../lib/api.ts";

function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className="rounded border border-line px-2.5 py-1.5 text-sm text-ink-muted hover:text-ink hover:border-line-strong transition-colors"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

function CountrySelect() {
  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  if (!meta.data) return <div className="skeleton h-9 w-56" aria-hidden />;
  return (
    <select
      aria-label="Select country"
      value={params.iso3 ?? "USA"}
      onChange={(e) =>
        navigate({
          to: "/country/$iso3",
          params: { iso3: e.target.value },
          search: (prev) => prev,
        })
      }
      className="h-9 w-56 rounded border border-line bg-surface px-2 text-sm text-ink hover:border-line-strong focus:outline-2 focus:outline-export"
    >
      {meta.data.countries.map((c) => (
        <option key={c.iso3} value={c.iso3}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function RootLayout() {
  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link to="/" className="shrink-0">
            <span className="font-display text-2xl font-semibold tracking-tight">
              World Trade
            </span>
            <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
              Explorer
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <CountrySelect />
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
            declarations. Values in current US dollars.
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
