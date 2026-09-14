"use client";

import React from "react";
import type { PriceHistoryPoint } from "@mysupplier/shared";
import { formatDate, formatSar } from "@/lib/format";

/** Dependency-free SVG line chart of average price with a min/max band. */
export function PriceHistoryChart({ points, lang, height = 180 }: { points: PriceHistoryPoint[]; lang: "en" | "ar"; height?: number }) {
  if (!points || points.length < 2) {
    return <p className="py-8 text-center text-sm text-slate-500">Not enough history yet.</p>;
  }
  const width = 320;
  const padX = 8;
  const padY = 12;
  const values = points.map((p) => p.avg);
  const mins = points.map((p) => p.min);
  const maxs = points.map((p) => p.max);
  const lo = Math.min(...mins, ...values);
  const hi = Math.max(...maxs, ...values);
  const span = hi - lo || 1;
  const x = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2);
  const y = (v: number) => padY + (1 - (v - lo) / span) * (height - padY * 2);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const band = [
    ...maxs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`),
    ...mins
      .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .reverse(),
    "Z",
  ].join(" ");
  const first = values[0];
  const last = values[values.length - 1];
  const change = first ? ((last - first) / first) * 100 : 0;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xl font-semibold tabular-nums text-slate-900">{formatSar(last, lang)}</span>
        <span className={change > 0 ? "text-sm font-medium text-red-600" : change < 0 ? "text-sm font-medium text-emerald-600" : "text-sm text-slate-500"}>
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}% over period
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Price history chart">
        <defs>
          <linearGradient id="hist-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0B6E4F" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0B6E4F" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={width - padX} y1={padY + f * (height - padY * 2)} y2={padY + f * (height - padY * 2)} stroke="#e2e8f0" strokeDasharray="3 3" />
        ))}
        <path d={band} fill="url(#hist-fill)" />
        <path d={line} fill="none" stroke="#0B6E4F" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last)} r="3.5" fill="#F2A900" stroke="#fff" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{formatDate(points[0].date, lang)}</span>
        <span>{formatDate(points[points.length - 1].date, lang)}</span>
      </div>
    </div>
  );
}
