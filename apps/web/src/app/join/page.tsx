"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { COMPANY_ROLE_DESCRIPTION, COMPANY_ROLE_LABEL, homeForRole, useAuth } from "@/lib/auth";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Button, Card, Input, LinkButton, LoadingBlock } from "@/components/ui";

function JoinInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const { user, login, logout } = useAuth();
  usePageTitle("Join your team");
  const info = useAsync(() => api.inviteInfo(token), [token], !!token);

  const [form, setForm] = useState({ name: "", password: "", confirm: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Please enter your full name.";
    if (form.password.length < 8) next.password = "Password must be at least 8 characters.";
    if (form.password !== form.confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    try {
      const auth = await api.acceptInvite({ token, name: form.name.trim(), password: form.password, phone: form.phone.trim() || undefined });
      login(auth);
      router.replace(auth.user.role === "SUPPLIER" ? "/supplier" : homeForRole(auth.user.role));
    } catch (err) {
      setError(errorMessage(err, "Could not accept the invitation."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Alert kind="warning">This invitation link is incomplete. Open the link from your email again or ask your manager to resend it.</Alert>
      </div>
    );
  }
  if (info.loading) return <LoadingBlock className="min-h-[50vh]" />;
  if (info.error || !info.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Alert onRetry={info.reload}>{info.error ?? "Invitation not found"}</Alert>
        <p className="mt-4 text-sm text-slate-500">Invitations expire after 7 days. Ask an owner or manager of the company to send a new one.</p>
        <LinkButton href="/login" variant="outline" className="mt-4">Go to login</LinkButton>
      </div>
    );
  }
  const inv = info.data;
  const expired = new Date(inv.expiresAt).getTime() < Date.now();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">You&apos;re invited</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Join {inv.company.name} on MySupplier</h1>
        <p className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 text-sm text-slate-500">
          as <Badge tone="green">{COMPANY_ROLE_LABEL[inv.role]}</Badge> · invitation for <span className="font-medium text-slate-700" dir="ltr">{inv.email}</span>
        </p>
        <p className="mt-2 text-xs text-slate-500">{COMPANY_ROLE_DESCRIPTION[inv.role]}</p>
      </div>
      <Card className="p-6">
        {expired ? (
          <Alert kind="warning">This invitation expired on {formatDateTime(inv.expiresAt)}. Ask your manager to send a new one.</Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert>{error}</Alert>}
            {user && user.email.toLowerCase() !== inv.email.toLowerCase() && (
              <Alert kind="info">
                You are signed in as <span className="font-medium" dir="ltr">{user.email}</span>. Accepting will attach the invitation to <span dir="ltr">{inv.email}</span>.{" "}
                <button type="button" className="font-semibold underline" onClick={logout}>Sign out first</button>
              </Alert>
            )}
            <Input label="Email" name="email" value={inv.email} readOnly disabled dir="ltr" />
            <Input label="Full name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required autoFocus />
            <Input label="Phone (optional)" name="phone" type="tel" dir="ltr" placeholder="+9665XXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint="At least 8 characters. If you already have a MySupplier account with this email, enter its password." required />
            <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={errors.confirm} required />
            <Button type="submit" className="w-full" loading={submitting}>Join {inv.company.name}</Button>
            <p className="text-center text-xs text-slate-500">
              By joining you agree to the <Link href="/terms" className="font-semibold text-brand-700 hover:underline">Terms</Link> and <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.
            </p>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-slate-400">Invitation valid until {formatDateTime(inv.expiresAt)}.</p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <JoinInner />
    </Suspense>
  );
}
