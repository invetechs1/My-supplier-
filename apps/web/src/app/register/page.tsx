"use client";
import React from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SAUDI_CITIES, type CompanyType, type RegisterPayload } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { homeForRole, useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Button, Card, Input, LoadingBlock, Select } from "@/components/ui";

const COMPANY_TYPES: CompanyType[] = ["SUPPLIER", "CONTRACTOR", "CONSULTANT", "OTHER"];

type Errors = Partial<Record<string, string>>;

function RegisterInner() {
  const { t, lang } = useI18n();
  const { user, login, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [role, setRole] = useState<"BUYER" | "SUPPLIER">(params.get("role") === "SUPPLIER" ? "SUPPLIER" : "BUYER");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [company, setCompany] = useState({ name: "", nameAr: "", type: "SUPPLIER" as CompanyType, city: "Riyadh", crNumber: "", vatNumber: "", phone: "" });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  usePageTitle(t("auth.register"));

  useEffect(() => {
    if (!loading && user) router.replace(homeForRole(user.role));
  }, [loading, user, router]);

  const validate = (): boolean => {
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address.";
    if (form.password.length < 8) next.password = "Password must be at least 8 characters.";
    if (role === "SUPPLIER") {
      if (company.name.trim().length < 2) next.companyName = "Company name is required.";
      if (!company.city) next.companyCity = "Select a city.";
      if (company.crNumber && !/^\d{10}$/.test(company.crNumber)) next.crNumber = "CR number is usually 10 digits.";
      if (company.vatNumber && !/^\d{15}$/.test(company.vatNumber)) next.vatNumber = "VAT number is 15 digits.";
    }
    if (!agree) next.agree = "You must accept the Terms and Privacy Policy to create an account.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    const payload: RegisterPayload = {
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      role,
      locale: lang,
    };
    if (role === "SUPPLIER") {
      payload.company = {
        name: company.name.trim(),
        nameAr: company.nameAr.trim() || undefined,
        type: company.type,
        city: company.city,
        crNumber: company.crNumber.trim() || undefined,
        vatNumber: company.vatNumber.trim() || undefined,
        phone: company.phone.trim() || undefined,
      };
    }
    setSubmitting(true);
    try {
      const auth = await api.register(payload);
      login(auth);
      router.replace(homeForRole(auth.user.role));
    } catch (err) {
      setError(errorMessage(err, "Registration failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("auth.register")}</h1>
        <p className="mt-1 text-sm text-slate-500">Join Saudi Arabia&apos;s building-materials marketplace.</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">{t("auth.role")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["BUYER", "SUPPLIER"] as const).map((r) => (
                <label
                  key={r}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
                    role === r ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-600" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{r === "BUYER" ? t("auth.buyer") : t("auth.supplier")}</span>
                    <span className="block text-xs text-slate-500">
                      {r === "BUYER" ? "Search prices, send RFQs and award orders." : "Publish prices, receive RFQs and submit bids."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t("auth.name")} name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required />
            <Input label="Phone" name="phone" type="tel" placeholder="+9665XXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
            <Input label={t("auth.email")} name="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} required />
            <Input label={t("auth.password")} name="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint="At least 8 characters" required />
          </div>

          {role === "SUPPLIER" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Company details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Company name" name="companyName" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} error={errors.companyName} required />
                <Input label="Company name (Arabic)" name="companyNameAr" dir="rtl" value={company.nameAr} onChange={(e) => setCompany({ ...company, nameAr: e.target.value })} />
                <Select label="Company type" name="companyType" value={company.type} onChange={(e) => setCompany({ ...company, type: e.target.value as CompanyType })} options={COMPANY_TYPES.map((c) => ({ value: c, label: c }))} />
                <Select label="City" name="companyCity" value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={errors.companyCity} required />
                <Input label="CR number" name="crNumber" inputMode="numeric" dir="ltr" value={company.crNumber} onChange={(e) => setCompany({ ...company, crNumber: e.target.value })} error={errors.crNumber} hint="Commercial registration (10 digits)" />
                <Input label="VAT number" name="vatNumber" inputMode="numeric" dir="ltr" value={company.vatNumber} onChange={(e) => setCompany({ ...company, vatNumber: e.target.value })} error={errors.vatNumber} hint="15 digits" />
                <Input label="Company phone" name="companyPhone" type="tel" dir="ltr" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
              </div>
            </div>
          )}

          <div>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" required />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="font-semibold text-brand-700 hover:underline">Terms of Service</Link> and{" "}
                <Link href="/privacy" target="_blank" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.
              </span>
            </label>
            {errors.agree && <p className="mt-1 text-xs text-red-600">{errors.agree}</p>}
          </div>

          <Button type="submit" className="w-full" loading={submitting}>{t("auth.register")}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">{t("auth.login")}</Link>
        </p>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <RegisterInner />
    </Suspense>
  );
}
