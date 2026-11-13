"use client";
import React from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CR_NUMBER_REGEX, SAUDI_CITIES, VAT_NUMBER_REGEX, citiesInRegionOf, isSaudiPhone, type CompanyType, type RegisterPayload } from "@mysupplier/shared";
import { ApiRequestError, api, errorMessage } from "@/lib/api";
import { homeForRole, safeNext, useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Button, Card, Input, Label, LoadingBlock, Select } from "@/components/ui";

/** Buyers pick how they build; suppliers are always SUPPLIER. */
const BUYER_TYPES: CompanyType[] = ["CONTRACTOR", "CONSULTANT", "OTHER"];
const DEFAULT_CITY = "Riyadh";

type Errors = Partial<Record<string, string>>;
const linkClass = "font-semibold text-brand-700 hover:underline";

function RegisterInner() {
  const { t, lang } = useI18n();
  const { user, login, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [role, setRole] = useState<"BUYER" | "SUPPLIER">(params.get("role") === "SUPPLIER" ? "SUPPLIER" : "BUYER");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [company, setCompany] = useState({ name: "", nameAr: "", type: "CONTRACTOR" as CompanyType, city: DEFAULT_CITY, crNumber: "", vatNumber: "", phone: "", website: "" });
  const [citiesServed, setCitiesServed] = useState<string[]>([DEFAULT_CITY]);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeSupplier, setAgreeSupplier] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [crDuplicate, setCrDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  usePageTitle(t("auth.register"));
  const isSupplier = role === "SUPPLIER";

  useEffect(() => {
    if (!loading && user) router.replace(homeForRole(user.role));
  }, [loading, user, router]);

  /** The head-office city is always part of the delivery zone. */
  const setCity = (city: string) => {
    setCompany((c) => ({ ...c, city }));
    setCitiesServed((list) => (list.includes(city) ? list : [...list, city]));
  };
  const toggleCity = (city: string) => setCitiesServed((list) => (list.includes(city) ? list.filter((x) => x !== city) : [...list, city]));

  const validate = (): boolean => {
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = t("reg.err.name");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = t("reg.err.email");
    if (form.password.length < 8) next.password = t("reg.err.password");
    if (form.phone.trim() && !isSaudiPhone(form.phone.trim())) next.phone = t("reg.err.phone");
    if (company.name.trim().length < 2) next.companyName = t("reg.err.companyName");
    if (!company.city) next.companyCity = t("reg.err.city");
    if (!CR_NUMBER_REGEX.test(company.crNumber.trim())) next.crNumber = t("reg.err.cr");
    if (!VAT_NUMBER_REGEX.test(company.vatNumber.trim())) next.vatNumber = t("reg.err.vat");
    if (!isSaudiPhone(company.phone.trim())) next.companyPhone = t("reg.err.companyPhone");
    if (isSupplier && citiesServed.length === 0) next.citiesServed = t("reg.err.cities");
    if (!agreeTerms) next.agree = t("reg.err.terms");
    if (isSupplier && !agreeSupplier) next.agreeSupplier = t("reg.err.supplierAgreement");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCrDuplicate(false);
    if (!validate()) return;
    const payload: RegisterPayload = {
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      role,
      locale: lang,
      company: {
        name: company.name.trim(),
        nameAr: company.nameAr.trim() || undefined,
        type: isSupplier ? "SUPPLIER" : company.type,
        city: company.city,
        crNumber: company.crNumber.trim(),
        vatNumber: company.vatNumber.trim(),
        phone: company.phone.trim(),
        website: company.website.trim() || undefined,
        ...(isSupplier ? { citiesServed } : {}),
      },
      acceptTerms: true,
      ...(isSupplier ? { acceptSupplierAgreement: true as const } : {}),
    };
    setSubmitting(true);
    try {
      const auth = await api.register(payload);
      login(auth);
      router.replace(homeForRole(auth.user.role));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && /\bCR\b/.test(err.message)) setCrDuplicate(true);
      else setError(errorMessage(err, t("reg.failed")));
    } finally {
      setSubmitting(false);
    }
  };

  const nextParam = safeNext(params.get("next"));
  const cityOptions = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("auth.register")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("reg.subtitle")}</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}
          {crDuplicate && (
            <Alert>
              {t("reg.err.crDuplicate")}{" "}
              <Link href={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login"} className="font-semibold underline">{t("reg.err.crDuplicateLogin")}</Link>.
            </Alert>
          )}

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
                    <span className="block text-xs text-slate-500">{r === "BUYER" ? t("reg.roleBuyerDesc") : t("reg.roleSupplierDesc")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <h2 className="text-sm font-semibold text-slate-900">{t("reg.contact")}</h2>
            <p className="mb-3 text-xs text-slate-500">{t("reg.contactHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t("auth.name")} name="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required />
              <Input label={t("reg.phone")} name="phone" type="tel" autoComplete="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} dir="ltr" />
              <Input label={t("auth.email")} name="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} required />
              <Input label={t("auth.password")} name="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint={t("reg.passwordHint")} required />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">{t("reg.company")}</h2>
            <p className="mb-3 text-xs text-slate-500">{isSupplier ? t("reg.companyHintSupplier") : t("reg.companyHintBuyer")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t("reg.companyName")} name="companyName" autoComplete="organization" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} error={errors.companyName} required />
              <Input label={t("reg.companyNameAr")} name="companyNameAr" dir="rtl" value={company.nameAr} onChange={(e) => setCompany({ ...company, nameAr: e.target.value })} />
              {isSupplier ? (
                <Input label={t("reg.companyType")} name="companyType" value={t("reg.type.SUPPLIER")} readOnly disabled />
              ) : (
                <Select label={t("reg.companyType")} name="companyType" value={company.type} onChange={(e) => setCompany({ ...company, type: e.target.value as CompanyType })} options={BUYER_TYPES.map((c) => ({ value: c, label: t(`reg.type.${c}` as TranslationKey) }))} required />
              )}
              <Select label={t("reg.city")} name="companyCity" value={company.city} onChange={(e) => setCity(e.target.value)} options={cityOptions} error={errors.companyCity} required />
              <Input label={t("reg.cr")} name="crNumber" inputMode="numeric" maxLength={10} dir="ltr" placeholder="1010XXXXXX" value={company.crNumber} onChange={(e) => setCompany({ ...company, crNumber: e.target.value.replace(/\D/g, "") })} error={errors.crNumber} hint={t("reg.crHint")} required />
              <Input label={t("reg.vat")} name="vatNumber" inputMode="numeric" maxLength={15} dir="ltr" placeholder="3XXXXXXXXXXXXX3" value={company.vatNumber} onChange={(e) => setCompany({ ...company, vatNumber: e.target.value.replace(/\D/g, "") })} error={errors.vatNumber} hint={t("reg.vatHint")} required />
              <Input label={t("reg.companyPhone")} name="companyPhone" type="tel" dir="ltr" placeholder="05XXXXXXXX" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} error={errors.companyPhone} hint={t("reg.companyPhoneHint")} required />
              <Input label={t("reg.website")} name="website" type="url" dir="ltr" placeholder="https://" value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} />
            </div>

            {isSupplier && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Label required>{t("reg.serviceArea")}</Label>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <button type="button" className="text-brand-700 hover:underline" onClick={() => setCitiesServed([...new Set([...citiesServed, ...citiesInRegionOf(company.city)])])}>{t("reg.sameRegion")}</button>
                    <button type="button" className="text-brand-700 hover:underline" onClick={() => setCitiesServed([...SAUDI_CITIES])}>{t("reg.selectAll")}</button>
                    <button type="button" className="text-slate-500 hover:underline" onClick={() => setCitiesServed([company.city])}>{t("reg.clear")}</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("reg.serviceArea")}>
                  {SAUDI_CITIES.map((city) => {
                    const on = citiesServed.includes(city);
                    return (
                      <button key={city} type="button" onClick={() => toggleCity(city)} aria-pressed={on} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-400")}>
                        {on ? "✓ " : ""}{city}
                      </button>
                    );
                  })}
                </div>
                <p className={cn("mt-2 text-xs", errors.citiesServed ? "text-red-600" : "text-slate-500")}>{errors.citiesServed ?? `${citiesServed.length} ${t("reg.citiesSelected")} – ${t("reg.serviceAreaHint")}`}</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" name="agree" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" required />
                <span>
                  {t("reg.agreeTerms")} <Link href="/terms" target="_blank" className={linkClass}>{t("reg.terms")}</Link> {t("reg.and")} <Link href="/privacy" target="_blank" className={linkClass}>{t("reg.privacy")}</Link>.
                </span>
              </label>
              {errors.agree && <p className="mt-1 text-xs text-red-600">{errors.agree}</p>}
            </div>
            {isSupplier && (
              <div>
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input type="checkbox" name="agreeSupplier" checked={agreeSupplier} onChange={(e) => setAgreeSupplier(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" required />
                  <span>
                    {t("reg.agreeSupplier")} <Link href="/supplier-agreement" target="_blank" className={linkClass}>{t("reg.supplierAgreement")}</Link>.
                  </span>
                </label>
                {errors.agreeSupplier && <p className="mt-1 text-xs text-red-600">{errors.agreeSupplier}</p>}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" loading={submitting}>{t("auth.register")}</Button>
        </form>
        <div className="relative my-5">
          <span className="absolute inset-x-0 top-1/2 h-px bg-slate-200" aria-hidden />
          <span className="relative mx-auto block w-fit bg-white px-3 text-xs uppercase tracking-wide text-slate-400">{t("reg.or")}</span>
        </div>
        <Link href={`/login?method=phone${nextParam ? `&next=${encodeURIComponent(nextParam)}` : ""}`} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
          </svg>
          {t("reg.signUpMobile")}
        </Link>
        <p className="mt-4 text-center text-sm text-slate-500">
          {t("reg.already")}{" "}
          <Link href="/login" className={linkClass}>{t("auth.login")}</Link>
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
