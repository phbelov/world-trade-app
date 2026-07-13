import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { CommandPalette } from "../components/CommandPalette.tsx";
import { IconButton } from "../components/ui.tsx";
import { fetchMeta } from "../lib/api.ts";
import { useTheme } from "../theme.tsx";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      onClick={toggle}
      label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </IconButton>
  );
}

const navLink =
  "text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted hover:text-ink transition-colors";

export function RootLayout() {
  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 px-6">
          <div className="flex min-w-0 items-baseline gap-8">
            <Link to="/" className="shrink-0 text-sm font-bold uppercase tracking-[0.08em]">
              World Trade
            </Link>
            <nav className="flex items-baseline gap-5" aria-label="Main">
              <Link
                to="/"
                className={navLink}
                activeOptions={{ exact: true }}
                activeProps={{ className: `${navLink} !text-ink underline underline-offset-4` }}
              >
                Map
              </Link>
              <Link
                to="/compare"
                className={navLink}
                activeProps={{ className: `${navLink} !text-ink underline underline-offset-4` }}
              >
                Compare
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <CommandPalette />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-5 text-[11px] uppercase tracking-[0.08em] leading-relaxed text-ink-muted">
          <p>
            Data: CEPII BACI (HS92) · Etalab 2.0 — provisional year: UN
            Comtrade, unreconciled · boundaries: Natural Earth · current USD
          </p>
          {meta.data && (
            <p className="mt-0.5">
              {meta.data.datasets.map((d) => d.id).join(" · ")}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
