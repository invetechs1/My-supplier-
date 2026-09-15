"use client";

import React, { useId, useState } from "react";
import type { SeriesPoint } from "@mysupplier/shared";
import { cn, formatDate } from "@/lib/format";

const BRAND = "#0B6E4F";
const ACCENT = "#F2A900";

function scale(points: SeriesPoint[]) {
  const values = points.map((p) => Number(p.value) || 0);
  const hi = Math.max(1, ...values);
  return { values, hi };
}

/** Tiny inline line for KPI tiles – no axes, no labels. */
export function Sparkline({ points, width = 120, height = 32, color = BRAND, className }: { points: SeriesPoint[]; width?: number; height?: number; color?: string; className?: string }) {
  if (!points || points.length < 2) return <span className={cn("block", className)} style={{ width, height }} aria-hidden />;
  const { values, hi } = scale(points);
  const lo = Math.min(...values);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - lo) / span) * (height - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn("overflow-visible", className)} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.2" fill={ACCENT} stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

/** Dependency-free SVG line/area chart of a daily series (same approach as PriceHistoryChart). */
export function LineChart({
  points,
  lang,
  height = 200,
  format = (v) => String(v),
  color = BRAND,
  label = "Chart",
}: {
  points: SeriesPoint[];
  lang: "en" | "ar";
  height?: number;
  format?: (v: number) => string;
  color?: string;
  label?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (!points || points.length < 2) return <p className="py-8 text-center text-sm text-slate-500">Not enough data yet.</p>;
  const width = 480;
  const padX = 8;
  const padY = 14;
  const { values, hi } = scale(points);
  const x = (i: number) => padX + (i / (values.length - 1)) * (width - padX * 2);
  const y = (v: number) => padY + (1 - v / hi) * (height - padY * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${(height - padY).toFixed(1)} L${x(0).toFixed(1)},${(height - padY).toFixed(1)} Z`;
  const total = values.reduce((a, b) => a + b, 0);
  const active = hover ?? values.length - 1;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold tabular-nums text-slate-900">{format(values[active])}</span>
        <span className="text-slate-500">{formatDate(points[active].date, lang)}{hover === null ? ` · total ${format(total)}` : ""}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.round(((rel - padX) / (width - padX * 2)) * (values.length - 1));
          setHover(Math.max(0, Math.min(values.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={width - padX} y1={padY + f * (height - padY * 2)} y2={padY + f * (height - padY * 2)} stroke="#e2e8f0" strokeDasharray="3 3" />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(active)} x2={x(active)} y1={padY} y2={height - padY} stroke="#94a3b8" strokeDasharray="2 3" />
        <circle cx={x(active)} cy={y(values[active])} r="4" fill={ACCENT} stroke="#fff" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{formatDate(points[0].date, lang)}</span>
        <span>{formatDate(points[points.length - 1].date, lang)}</span>
      </div>
    </div>
  );
}

/** Dependency-free SVG bar chart of a daily series. */
export function BarChart({
  points,
  lang,
  height = 200,
  format = (v) => String(v),
  color = BRAND,
  label = "Bar chart",
}: {
  points: SeriesPoint[];
  lang: "en" | "ar";
  height?: number;
  format?: (v: number) => string;
  color?: string;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points || points.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Not enough data yet.</p>;
  const width = 480;
  const padX = 8;
  const padY = 14;
  const { values, hi } = scale(points);
  const n = values.length;
  const slot = (width - padX * 2) / n;
  const barW = Math.max(2, slot * 0.65);
  const y = (v: number) => padY + (1 - v / hi) * (height - padY * 2);
  const total = values.reduce((a, b) => a + b, 0);
  const active = hover ?? n - 1;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold tabular-nums text-slate-900">{format(values[active])}</span>
        <span className="text-slate-500">{formatDate(points[active].date, lang)}{hover === null ? ` · total ${format(total)}` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={width - padX} y1={padY + f * (height - padY * 2)} y2={padY + f * (height - padY * 2)} stroke="#e2e8f0" strokeDasharray="3 3" />
        ))}
        {values.map((v, i) => {
          const cx = padX + slot * i + slot / 2;
          const top = y(v);
          return (
            <g key={points[i].date} onMouseEnter={() => setHover(i)}>
              <rect x={padX + slot * i} y={padY} width={slot} height={height - padY * 2} fill="transparent" />
              <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(0, height - padY - top)} rx={2} fill={i === active ? ACCENT : color} opacity={i === active ? 1 : 0.85} />
            </g>
          );
        })}
        <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} stroke="#cbd5e1" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{formatDate(points[0].date, lang)}</span>
        <span>{formatDate(points[n - 1].date, lang)}</span>
      </div>
    </div>
  );
}

/** Horizontal bars for a categorical breakdown (e.g. orders by status). */
export function HorizontalBars({ rows, format = (v) => String(v) }: { rows: Array<{ label: string; value: number; color?: string }>; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-slate-500">No data yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{r.label}</span>
            <span className="tabular-nums text-slate-500">{format(r.value)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={cn("h-full rounded-full", r.color ?? "bg-brand-500")} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
