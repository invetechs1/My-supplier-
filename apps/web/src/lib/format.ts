import { formatSar } from "@mysupplier/shared";
import type { Lang } from "./i18n";

export { formatSar };

export function formatDate(value: string | null | undefined, lang: Lang = "en"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | null | undefined, lang: Lang = "en"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const AGO = {
  en: { now: "just now", m: "m ago", h: "h ago", d: "d ago", mo: "mo ago", y: "y ago" },
  ar: { now: "الآن", m: " د", h: " س", d: " يوم", mo: " شهر", y: " سنة" },
} as const;

/** Relative time; Arabic when the stored UI language is Arabic (reads `ms_lang` so call sites need no change). */
export function timeAgo(value: string | null | undefined, lang?: Lang): string {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return "—";
  let l: Lang = lang ?? "en";
  if (!lang && typeof window !== "undefined") { try { if (window.localStorage.getItem("ms_lang") === "ar") l = "ar"; } catch { /* ignore */ } }
  const w = AGO[l];
  const pre = l === "ar" ? "قبل" : "";
  const fmt = (n: number, unit: string) => (l === "ar" ? `${pre} ${n}${unit}` : `${n}${unit}`);
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return w.now;
  if (mins < 60) return fmt(mins, w.m);
  const hours = Math.round(mins / 60);
  if (hours < 24) return fmt(hours, w.h);
  const days = Math.round(hours / 24);
  if (days < 30) return fmt(days, w.d);
  const months = Math.round(days / 30);
  if (months < 12) return fmt(months, w.mo);
  return fmt(Math.round(months / 12), w.y);
}

export function formatNumber(value: number | null | undefined, lang: Lang = "en"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/** Convert an ISO string to the value expected by <input type="datetime-local"> */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Only http(s) URLs may be used as an anchor href from user/data-supplied strings (blocks `javascript:` / `data:`). */
export const safeHref = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : undefined);

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
