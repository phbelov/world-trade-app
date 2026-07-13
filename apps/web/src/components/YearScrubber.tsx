import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
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
        className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-bg text-ink-muted hover:border-line-strong hover:text-ink"
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
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
        className="h-px w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-(--ink)"
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
