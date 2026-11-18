'use client';

import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { pctChange } from './analytics';

/** Current time (ms) that re-renders every `ms`. Keeps Date.now() out of render (react-hooks/purity). */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Small "▲ 8.2%" change vs the previous period. Green when good, red when bad;
 * `invert` for lower-is-better metrics. `points` shows a point change (for rates already in %).
 * Renders nothing when there is no prior data (prev 0 for amounts, NaN for rates).
 */
export function Delta({ cur, prev, invert, points }: { cur: number; prev: number; invert?: boolean; points?: boolean }) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || (!points && !prev)) return null;
  const p = points ? cur - prev : pctChange(cur, prev);
  const good = invert ? p <= 0 : p >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums whitespace-nowrap', good ? 'text-[#1f6b3f]' : 'text-[#c8151d]')}
      title={`vs previous period${points ? ' (points)' : ''}`}>
      {p >= 0 ? '▲' : '▼'}{Math.abs(p).toFixed(1)}%
    </span>
  );
}

const OUTLINE = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#e3d6cc] bg-white px-3.5 h-10 text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2]';

/** CSV download + PDF (browser print). */
export function ExportButtons({ onCsv }: { onCsv: () => void }) {
  return (
    <>
      <button type="button" onClick={onCsv} className={OUTLINE}>
        <Download className="w-4 h-4" strokeWidth={1.75} /> CSV
      </button>
      <button type="button" onClick={() => window.print()} className={OUTLINE}>
        <FileText className="w-4 h-4" strokeWidth={1.75} /> PDF
      </button>
    </>
  );
}
export const outlineButtonClass = OUTLINE;

/** Horizontal share bar used inside breakdown tables. */
export function ShareBar({ value, max, color = '#c8151d' }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-[#f3ece6] w-full min-w-16">
      <div className="h-2 rounded-full" style={{ width: `${max && value > 0 ? Math.max(1.5, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}
