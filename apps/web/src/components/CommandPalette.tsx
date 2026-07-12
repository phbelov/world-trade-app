import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchMeta } from "../lib/api.ts";

/**
 * ⌘K country search on a native <dialog> — focus trap and Esc handling come
 * from the platform.
 */
export function CommandPalette() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function open() {
    setQuery("");
    setActive(0);
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }

  const results = useMemo(() => {
    const countries = meta.data?.countries ?? [];
    if (!query.trim()) return countries.slice(0, 10);
    const q = query.trim().toLowerCase();
    const starts = countries.filter((c) =>
      c.name.toLowerCase().startsWith(q),
    );
    const contains = countries.filter(
      (c) =>
        !c.name.toLowerCase().startsWith(q) &&
        (c.name.toLowerCase().includes(q) || c.iso3.toLowerCase() === q),
    );
    return [...starts, ...contains].slice(0, 10);
  }, [meta.data, query]);

  function go(iso3: string) {
    dialogRef.current?.close();
    navigate({ to: "/country/$iso3", params: { iso3 } });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-9 items-center gap-2 rounded border border-line bg-surface px-3 text-sm text-ink-muted hover:border-line-strong hover:text-ink transition-colors"
      >
        <span>Search countries</span>
        <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
        className="fixed inset-0 m-auto h-fit w-full max-w-md rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="p-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                go(results[active].iso3);
              }
            }}
            placeholder="Type a country name…"
            aria-label="Search countries"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            className="w-full rounded border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-line-strong"
          />
          <ul id="palette-results" role="listbox" className="mt-2 max-h-80 overflow-y-auto">
            {results.map((c, i) => (
              <li key={c.iso3} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => go(c.iso3)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                    i === active ? "bg-line/60" : ""
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-ink-muted">{c.iso3}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-ink-muted">
                No countries match “{query}”.
              </li>
            )}
          </ul>
        </div>
      </dialog>
    </>
  );
}
