import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchMeta, searchProducts } from "../lib/api.ts";

type Item =
  | { kind: "country"; key: string; label: string; hint: string }
  | { kind: "product"; key: string; label: string; hint: string };

/**
 * ⌘K search over countries and HS products on a native <dialog> — focus trap
 * and Esc handling come from the platform.
 */
export function CommandPalette() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const meta = useQuery({ queryKey: ["meta"], queryFn: fetchMeta });

  const trimmed = query.trim();
  const productSearch = useQuery({
    queryKey: ["productSearch", trimmed],
    queryFn: () => searchProducts(trimmed),
    enabled: trimmed.length >= 2,
    placeholderData: (prev) => prev,
  });

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

  const items = useMemo<Item[]>(() => {
    const countries = meta.data?.countries ?? [];
    const q = trimmed.toLowerCase();
    const matched = !q
      ? countries.slice(0, 8)
      : [
          ...countries.filter((c) => c.name.toLowerCase().startsWith(q)),
          ...countries.filter(
            (c) =>
              !c.name.toLowerCase().startsWith(q) &&
              (c.name.toLowerCase().includes(q) || c.iso3.toLowerCase() === q),
          ),
        ].slice(0, 6);
    const countryItems: Item[] = matched.map((c) => ({
      kind: "country",
      key: c.iso3,
      label: c.name,
      hint: c.iso3,
    }));
    const productItems: Item[] =
      trimmed.length >= 2
        ? (productSearch.data ?? []).slice(0, 6).map((p) => ({
            kind: "product",
            key: p.code,
            label: p.name,
            hint:
              p.level === "hs2" ? `Chapter ${p.code}` : `HS ${p.code}`,
          }))
        : [];
    return [...countryItems, ...productItems];
  }, [meta.data, trimmed, productSearch.data]);

  function go(item: Item) {
    dialogRef.current?.close();
    if (item.kind === "country") {
      navigate({ to: "/country/$iso3", params: { iso3: item.key } });
    } else {
      navigate({ to: "/product/$code", params: { code: item.key } });
    }
  }

  const firstProductIdx = items.findIndex((i) => i.kind === "product");

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-9 items-center gap-2 rounded border border-line bg-surface px-3 text-sm text-ink-muted hover:border-line-strong hover:text-ink transition-colors"
      >
        <span>Search countries &amp; products</span>
        <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
        className="fixed inset-0 m-auto h-fit w-full max-w-lg rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
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
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && items[active]) {
                go(items[active]);
              }
            }}
            placeholder="Country, product, or HS code…"
            aria-label="Search countries and products"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            className="w-full rounded border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-line-strong"
          />
          <ul
            id="palette-results"
            role="listbox"
            className="mt-2 max-h-96 overflow-y-auto"
          >
            {items.map((item, i) => (
              <li key={`${item.kind}-${item.key}`} role="option" aria-selected={i === active}>
                {i === firstProductIdx && (
                  <div className="mt-1 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Products
                  </div>
                )}
                {i === 0 && item.kind === "country" && trimmed.length >= 2 && (
                  <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Countries
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => go(item)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm ${
                    i === active ? "bg-line/60" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  <span className="shrink-0 text-xs text-ink-muted tnum">
                    {item.hint}
                  </span>
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-ink-muted">
                Nothing matches “{query}”.
              </li>
            )}
          </ul>
        </div>
      </dialog>
    </>
  );
}
