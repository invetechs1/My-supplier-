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

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
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
