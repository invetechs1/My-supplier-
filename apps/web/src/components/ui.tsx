"use client";

import Link from "next/link";
import React from "react";
import { cn } from "@/lib/format";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-600 shadow-sm",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:ring-brand-600",
  accent: "bg-amber-500 text-slate-900 hover:bg-amber-600 focus-visible:ring-amber-500 shadow-sm",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-brand-600",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  );
}

export interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({ href, variant = "primary", size = "md", className, children }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4", className)}>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
type BadgeTone = "green" | "amber" | "red" | "blue" | "slate" | "purple";

const badgeTones: Record<BadgeTone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

const statusTone: Record<string, BadgeTone> = {
  OPEN: "green",
  CLOSED: "slate",
  AWARDED: "blue",
  CANCELLED: "red",
  SUBMITTED: "amber",
  WITHDRAWN: "slate",
  ACCEPTED: "green",
  REJECTED: "red",
  PENDING: "amber",
  CONFIRMED: "blue",
  IN_TRANSIT: "purple",
  DELIVERED: "green",
  SUPPLIER: "green",
  MARKET: "blue",
  IMPORTED: "slate",
  QUOTATION: "purple",
  REVIEW: "amber",
  PROCESSING: "amber",
  PUBLISHED: "green",
  FAILED: "red",
  SUGGESTED: "amber",
  APPROVED: "green",
  BUYER: "blue",
  ADMIN: "purple",
};

export function Badge({ children, tone, className, title }: { children: React.ReactNode; tone?: BadgeTone; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        badgeTones[tone ?? "slate"],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? "slate"}>{status.replace(/_/g, " ")}</Badge>;
}

const SOURCE_LABEL: Record<string, string> = {
  SUPPLIER: "Supplier",
  MARKET: "Market",
  IMPORTED: "Imported",
  QUOTATION: "Quoted",
};
const SOURCE_TITLE: Record<string, string> = {
  SUPPLIER: "Published by the supplier",
  MARKET: "Market reference price",
  IMPORTED: "Price list loaded on the supplier's behalf",
  QUOTATION: "Price a buyer actually received",
};

/** Price listing source pill; QUOTATION renders purple as "Quoted" with an explanatory tooltip. */
export function SourceBadge({ source, className }: { source: string | null | undefined; className?: string }) {
  const key = (source ?? "MARKET").toUpperCase();
  return (
    <span title={SOURCE_TITLE[key] ?? key} className="inline-flex">
      <Badge tone={statusTone[key] ?? "slate"} className={className}>
        {SOURCE_LABEL[key] ?? key.replace(/_/g, " ")}
      </Badge>
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return (
    <Badge tone="green" className="gap-1">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
      Verified
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
const controlBase =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50 disabled:text-slate-500";

export function Label({ children, htmlFor, required }: { children: React.ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
      {children}
      {required && <span className="ms-0.5 text-red-500">*</span>}
    </label>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, required, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        className={cn(controlBase, error && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
        {...rest}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string | null;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function Select({ label, error, options, placeholder, className, id, children, required, ...rest }: SelectProps) {
  const selectId = id ?? rest.name;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={selectId} required={required}>
          {label}
        </Label>
      )}
      <select
        id={selectId}
        required={required}
        className={cn(controlBase, "pe-8", error && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <FieldError message={error} />
    </div>
  );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export function Textarea({ label, error, hint, className, id, required, ...rest }: TextareaProps) {
  const areaId = id ?? rest.name;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={areaId} required={required}>
          {label}
        </Label>
      )}
      <textarea
        id={areaId}
        required={required}
        className={cn(controlBase, "min-h-[96px]", error && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
        {...rest}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback: Spinner, EmptyState, Alert, Flash
// ---------------------------------------------------------------------------
export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <svg className={cn("animate-spin text-brand-600", dim, className)} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LoadingBlock({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3 py-12 text-sm text-slate-500", className)}>
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        {icon ?? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        )}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  kind = "error",
  children,
  onRetry,
  className,
}: {
  kind?: "error" | "success" | "info" | "warning";
  children: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm", tones[kind], className)}>
      <div>{children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 text-xs font-semibold underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

export function FlashMessage({ flash, className }: { flash: { kind: "success" | "error"; message: string } | null; className?: string }) {
  if (!flash) return null;
  return (
    <Alert kind={flash.kind} className={className}>
      {flash.message}
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// StatTile
// ---------------------------------------------------------------------------
export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "brand" | "amber";
  className?: string;
}) {
  const tones = {
    default: "bg-white border-slate-200",
    brand: "bg-brand-600 border-brand-600 text-white",
    amber: "bg-amber-50 border-amber-200",
  };
  return (
    <div className={cn("rounded-xl border p-4 shadow-card", tones[tone], className)}>
      <p className={cn("text-xs font-medium uppercase tracking-wide", tone === "brand" ? "text-brand-100" : "text-slate-500")}>{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "brand" ? "text-white" : "text-slate-900")}>{value}</p>
      {sub && <p className={cn("mt-1 text-xs", tone === "brand" ? "text-brand-100" : "text-slate-500")}>{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  dense?: boolean;
}) {
  const alignClass = (a?: Column<T>["align"]) => (a === "end" ? "text-end" : a === "center" ? "text-center" : "text-start");
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500", alignClass(c.align), c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                {empty ?? "No records"}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer hover:bg-brand-50/40")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 align-middle text-slate-700", dense ? "py-2" : "py-3", alignClass(c.align), c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={cn("max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price change (green/red)
// ---------------------------------------------------------------------------
export function PriceChange({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="text-slate-400">—</span>;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        flat ? "bg-slate-100 text-slate-600" : up ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
      )}
    >
      {!flat && (
        <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-3 w-3", !up && "rotate-180")} aria-hidden>
          <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
        </svg>
      )}
      {up ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
