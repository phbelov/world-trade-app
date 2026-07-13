/**
 * UI primitives — the design system's vocabulary. Everything visual that
 * repeats lives here: tracked-uppercase labels, hairline section rules with
 * right-aligned annotations, bracket-style actions, stats, selects.
 */
import type { ReactNode } from "react";

/** 11px tracked-uppercase metadata label. */
export function Label({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`label block ${className}`}>{children}</span>;
}

/**
 * Section opener: hairline on top, title left, annotation right.
 */
export function SectionHeader({
  title,
  annotation,
  children,
}: {
  title: ReactNode;
  annotation?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {annotation && <span className="label">{annotation}</span>}
      </div>
      {children}
    </div>
  );
}

/** Big number with a label above and an optional note below. */
export function Stat({
  label,
  value,
  valueTitle,
  note,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  valueTitle?: string | undefined;
  note?: ReactNode | undefined;
  tone?: "export" | "import" | "positive" | "negative" | undefined;
}) {
  const toneClass =
    tone === "export"
      ? "text-export"
      : tone === "import"
        ? "text-import"
        : tone === "positive"
          ? "text-positive"
          : tone === "negative"
            ? "text-negative"
            : "";
  return (
    <div>
      <Label>{label}</Label>
      <div
        className={`mt-1 text-2xl font-semibold tracking-tight tnum ${toneClass}`}
        title={valueTitle}
      >
        {value}
      </div>
      {note && <div className="mt-0.5 text-xs text-ink-muted">{note}</div>}
    </div>
  );
}

/** FAW-style bracket action: renders as [ CHILDREN ]. */
export function BracketButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted hover:text-ink transition-colors before:content-['['] after:content-[']'] before:mr-0.5 after:ml-0.5 ${className}`}
    >
      {children}
    </button>
  );
}

/** Square icon-only button with a hairline. */
export function IconButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center border border-line text-ink-muted hover:border-line-strong hover:text-ink transition-colors"
    >
      {children}
    </button>
  );
}

/** Hairline select. */
export function SelectBox({
  value,
  onChange,
  label,
  children,
  className = "",
}: {
  value: string | number;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 border border-line bg-bg px-2 text-sm hover:border-line-strong ${className}`}
    >
      {children}
    </select>
  );
}

/** Segmented control: a row of flat toggles separated by hairlines. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex divide-x divide-line border border-line">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`px-3 py-1.5 text-sm transition-colors ${
            value === o.id
              ? "bg-ink text-bg font-medium"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** FAW-style status dot. */
export function StatusDot({
  tone,
}: {
  tone: "positive" | "negative" | "muted";
}) {
  const cls =
    tone === "positive"
      ? "bg-positive"
      : tone === "negative"
        ? "bg-negative"
        : "bg-ink-muted";
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${cls}`}
    />
  );
}

/** Centered error state with an optional retry. */
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{message}</p>
      {onRetry && (
        <BracketButton onClick={onRetry} className="mt-5">
          Try again
        </BracketButton>
      )}
    </div>
  );
}
