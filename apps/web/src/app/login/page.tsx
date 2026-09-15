"use client";
import React from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { homeForRole, useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Button, Card, Input, LoadingBlock } from "@/components/ui";
import { PhoneOtpLogin } from "@/components/PhoneOtpLogin";

type Method = "email" | "phone";

function LoginInner() {
  const { t } = useI18n();
  const { user, login, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || params.get("redirect");
  usePageTitle(t("auth.login"));

  const [method, setMethod] = useState<Method>(() => (params.get("method") === "phone" || params.get("tab") === "phone" ? "phone" : "email"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next || homeForRole(user.role));
  }, [loading, user, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const auth = await api.login({ email: email.trim(), password });
      login(auth);
      router.replace(next || homeForRole(auth.user.role));
    } catch (err) {
      setError(errorMessage(err, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: Array<{ id: Method; label: string }> = [
    { id: "email", label: t("auth.email") },
    { id: "phone", label: "Mobile number" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("auth.login")}</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back. Sign in to manage RFQs, bids and orders.</p>
      </div>
      <Card className="p-6">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Sign-in method">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={method === tab.id}
              onClick={() => {
                setMethod(tab.id);
                setError(null);
              }}
              className={cn("rounded-lg px-3 py-2 text-sm font-semibold transition", method === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {method === "email" ? (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert>{error}</Alert>}
            <Input label={t("auth.email")} name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label={t("auth.password")} name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs font-semibold text-brand-700 hover:underline">Forgot password?</Link>
            </div>
            <Button type="submit" className="w-full" loading={submitting}>{t("auth.login")}</Button>
          </form>
        ) : (
          <PhoneOtpLogin
            onSuccess={(auth) => {
              login(auth);
              router.replace(next || homeForRole(auth.user.role));
            }}
          />
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          No account?{" "}
          <Link href="/register" className="font-semibold text-brand-700 hover:underline">{t("auth.register")}</Link>
        </p>
      </Card>
      <details className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-700">Demo accounts</summary>
        <ul className="mt-2 space-y-1">
          <li>Admin: admin@mysupplier.sa / Admin123!</li>
          <li>Buyer: buyer@mysupplier.sa / Buyer123!</li>
          <li>Supplier: supplier@mysupplier.sa / Supplier123!</li>
        </ul>
      </details>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <LoginInner />
    </Suspense>
  );
}
