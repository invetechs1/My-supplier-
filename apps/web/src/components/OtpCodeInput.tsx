"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/format";

/** Six single-digit boxes with auto-advance, backspace navigation and paste support. */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
  error,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
  className?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const setAt = (index: number, char: string) => {
    const arr = [...digits];
    arr[index] = char;
    commit(arr.join(""));
  };

  return (
    <div className={cn("flex justify-center gap-2", className)} dir="ltr" role="group" aria-label="Verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="\d*"
          maxLength={1}
          value={d}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            if (!raw) {
              setAt(i, "");
              return;
            }
            if (raw.length > 1) {
              // Typed/pasted several digits into one box: spread them from here.
              const arr = [...digits];
              raw.split("").forEach((c, j) => {
                if (i + j < length) arr[i + j] = c;
              });
              commit(arr.join(""));
              refs.current[Math.min(i + raw.length, length - 1)]?.focus();
              return;
            }
            setAt(i, raw);
            if (i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              if (digits[i]) {
                setAt(i, "");
              } else if (i > 0) {
                refs.current[i - 1]?.focus();
                setAt(i - 1, "");
              }
              e.preventDefault();
            } else if (e.key === "ArrowLeft" && i > 0) {
              refs.current[i - 1]?.focus();
              e.preventDefault();
            } else if (e.key === "ArrowRight" && i < length - 1) {
              refs.current[i + 1]?.focus();
              e.preventDefault();
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text").replace(/\D/g, "");
            if (!text) return;
            e.preventDefault();
            commit(text);
            refs.current[Math.min(text.length, length) - 1]?.focus();
          }}
          className={cn(
            "h-12 w-10 rounded-xl border bg-white text-center text-lg font-semibold tabular-nums text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50 sm:w-11",
            error ? "border-red-400" : "border-slate-300",
          )}
        />
      ))}
    </div>
  );
}
