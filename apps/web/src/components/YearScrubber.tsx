import { useEffect, useRef, useState } from "react";
import type { YearInfo } from "@world-trade/shared/api";

interface Props {
  years: YearInfo[];
  value: number;
  onChange: (year: number) => void;
}

/** Scrubbable timeline with autoplay — drag through three decades of trade. */
export function YearScrubber({ years, value, onChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const min = years[0]!.year;
  const max = years[years.length - 1]!.year;
  const current = years.find((y) => y.year === value);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = valueRef.current + 1;
      if (next > max) {
        setPlaying(false);
      } else {
        onChangeRef.current(next);
      }
    }, 750);
    return () => clearInterval(id);
  }, [playing, max]);

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => {
          if (!playing && value >= max) onChange(min);
          setPlaying((p) => !p);
        }}
        aria-label={playing ? "Pause" : "Play through years"}
        className="h-9 w-9 shrink-0 rounded-full border border-line bg-surface text-sm hover:border-line-strong"
      >
        {playing ? "⏸" : "▶"}
      </button>
      <span className="w-10 shrink-0 text-xs text-ink-muted tnum">{min}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => {
          setPlaying(false);
          onChange(Number(e.target.value));
        }}
        aria-label="Year"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-(--export)"
      />
      <span className="w-10 shrink-0 text-xs text-ink-muted tnum">{max}</span>
      <span className="shrink-0 text-sm font-semibold tnum">
        {value}
        {current?.provisional && (
          <span className="ml-1.5 align-middle text-[10px] font-medium uppercase tracking-wide text-provisional">
            prov.
          </span>
        )}
      </span>
    </div>
  );
}
