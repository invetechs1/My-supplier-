"use client";
import React from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { Alert, Button, Card, Input, LinkButton, LoadingBlock } from "@/components/ui";

function ResetInner() {
  usePageTitle("Reset password");
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <Card className="p-6 text-center">
        <h2 className="text-base font-semibold text-slate-900">This reset link is invalid</h2>
        <p className="mt-1 text-sm text-slate-600">The link is missing its token. Request a new one and open the latest email.</p>
        <LinkButton href="/forgot-password" className="mt-5">Request a new link</LinkButton>
      </Card>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "This reset link is invalid or has expired."));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card className="p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
        <h2 className="mt-3 text-base font-semibold text-slate-900">Password updated</h2>
        <p className="mt-1 text-sm text-slate-600">You can now log in with your new password.</p>
        <LinkButton href="/login" className="mt-5">Go to login</LinkButton>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Input label="New password" name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters" required autoFocus />
        <Input label="Confirm new password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <Button type="submit" className="w-full" loading={submitting}>Set new password</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">Back to login</Link>
      </p>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-500">Reset links are single-use and expire after 60 minutes.</p>
      </div>
      <Suspense fallback={<LoadingBlock />}>
        <ResetInner />
      </Suspense>
    </div>
  );
}
