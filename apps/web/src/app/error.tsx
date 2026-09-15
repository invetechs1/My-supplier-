"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { reportClientError } from "@/lib/errors";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the error in the console and report it to the API (fire-and-forget, throttled).
    console.error(error);
    reportClientError(error, { stack: error.digest ? `${error.stack ?? ""}\n[digest ${error.digest}]` : error.stack });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-slate-500">An unexpected error occurred while loading this page. Your data is safe — please try again.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">Error ID: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Back to home
        </Link>
        <Link href="/contact" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
          Contact support
        </Link>
      </div>
    </div>
  );
}
