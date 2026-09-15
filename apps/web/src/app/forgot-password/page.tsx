"use client";
import React from "react";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { Alert, Button, Card, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  usePageTitle("Forgot password");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await api.forgotPassword(email.trim());
    } catch (err) {
      // Only surface connectivity problems; never reveal whether the email exists.
      const status = (err as { status?: number }).status;
      if (status === 0) {
        setError(errorMessage(err));
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    setSent(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Forgot your password?</h1>
        <p className="mt-1 text-sm text-slate-500">Enter the email you registered with and we will send you a reset link.</p>
      </div>
      <Card className="p-6">
        {sent ? (
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </span>
            <h2 className="mt-3 text-base font-semibold text-slate-900">Check your inbox</h2>
            <p className="mt-1 text-sm text-slate-600">If that email exists we sent a link. It expires in 60 minutes — check your spam folder if it does not arrive.</p>
            <Link href="/login" className="mt-5 inline-block text-sm font-semibold text-brand-700 hover:underline">Back to login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert>{error}</Alert>}
            <Input label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Button type="submit" className="w-full" loading={submitting}>Send reset link</Button>
          </form>
        )}
      </Card>
      {!sent && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">Log in</Link>
        </p>
      )}
    </div>
  );
}
