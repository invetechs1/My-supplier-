"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { SAUDI_CITIES, type AuthResponse, type CompanyType, type OtpVerifyPayload } from "@mysupplier/shared";
import { ApiRequestError, api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatSaudiPhone, normaliseSaudiPhone } from "@/lib/phone";
import { cn } from "@/lib/format";
import { Alert, Button, Input, Select, Toggle } from "./ui";
import { OtpCodeInput } from "./OtpCodeInput";

const COMPANY_TYPES: CompanyType[] = ["SUPPLIER", "CONTRACTOR", "CONSULTANT", "OTHER"];
const RESEND_SECONDS = 60;

type Step = "phone" | "code" | "profile";

/** True when the API says the phone has no account yet (400/404 on /auth/otp/verify without a name). */
function isNewPhoneError(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) return false;
  if (err.status === 404) return true;
  if (err.status !== 400) return false;
  return /name|new|not found|no account|register|sign ?up|unknown/i.test(err.message);
}

/** Mobile-number field with the +966 prefix helper; accepts 05xxxxxxxx and normalises to +9665xxxxxxxx. */
export function SaudiPhoneInput({ value, onChange, error, disabled, label = "Mobile number", autoFocus, name = "phone" }: { value: string; onChange: (v: string) => void; error?: string | null; disabled?: boolean; label?: string; autoFocus?: boolean; name?: string }) {
  const normalised = normaliseSaudiPhone(value);
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">{label}<span className="ms-0.5 text-red-500">*</span></label>
      <div className={cn("flex overflow-hidden rounded-xl border bg-white shadow-sm focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20", error ? "border-red-400" : "border-slate-300")} dir="ltr">
        <span className="flex select-none items-center gap-1 border-e border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
          <span aria-hidden>🇸🇦</span> +966
        </span>
        <input
          id={name}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder="05x xxx xxxx"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:text-slate-500"
        />
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : <p className="mt-1 text-xs text-slate-500">{normalised ? <>Will be sent to <span className="font-mono" dir="ltr">{normalised}</span></> : "Enter your Saudi mobile number, e.g. 0512345678."}</p>}
    </div>
  );
}

/** Countdown-gated resend button. */
export function ResendButton({ onResend, disabled, seconds = RESEND_SECONDS, resetKey }: { onResend: () => Promise<void> | void; disabled?: boolean; seconds?: number; resetKey: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resetKey, seconds]);
  return (
    <button type="button" onClick={() => void onResend()} disabled={disabled || left > 0} className="text-xs font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">
      {left > 0 ? `Resend code in ${left}s` : "Resend code"}
    </button>
  );
}

/**
 * Phone OTP sign-in: request a code, verify it; if the phone is new the API asks for a name
 * (and company details for suppliers) and we retry with them.
 */
export function PhoneOtpLogin({ onSuccess }: { onSuccess: (auth: AuthResponse) => void }) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [sendKey, setSendKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [isSupplier, setIsSupplier] = useState(false);
  const [company, setCompany] = useState({ name: "", nameAr: "", type: "SUPPLIER" as CompanyType, city: "Riyadh", crNumber: "", vatNumber: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const verifying = useRef(false);

  const sendCode = async (target = phone) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.otpRequest({ phone: target, purpose: "LOGIN" });
      setDevCode(res.devCode ?? null);
      setChannel(res.channel);
      setCode("");
      setSendKey((k) => k + 1);
      setStep("code");
    } catch (err) {
      setError(errorMessage(err, "Could not send the code."));
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = normaliseSaudiPhone(phoneInput);
    if (!n) {
      setError("Enter a valid Saudi mobile number (05xxxxxxxx).");
      return;
    }
    setPhone(n);
    await sendCode(n);
  };

  const verify = async (payloadExtra: Partial<OtpVerifyPayload> = {}) => {
    if (!phone || code.length !== 6 || verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError(null);
    try {
      const auth = await api.otpVerify({ phone, code, ...payloadExtra });
      onSuccess(auth);
    } catch (err) {
      if (step === "code" && isNewPhoneError(err)) {
        setStep("profile");
      } else {
        setError(errorMessage(err, "Verification failed"));
      }
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  };

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Please enter your full name.";
    if (isSupplier) {
      if (company.name.trim().length < 2) next.companyName = "Company name is required.";
      if (!company.city) next.companyCity = "Select a city.";
      if (company.crNumber && !/^\d{10}$/.test(company.crNumber)) next.crNumber = "CR number is usually 10 digits.";
      if (company.vatNumber && !/^\d{15}$/.test(company.vatNumber)) next.vatNumber = "VAT number is 15 digits.";
    }
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    await verify({
      name: name.trim(),
      role: isSupplier ? "SUPPLIER" : "BUYER",
      company: isSupplier
        ? { name: company.name.trim(), nameAr: company.nameAr.trim() || undefined, type: company.type, city: company.city, crNumber: company.crNumber.trim() || undefined, vatNumber: company.vatNumber.trim() || undefined, phone: phone ?? undefined }
        : undefined,
    });
  };

  if (step === "phone") {
    return (
      <form onSubmit={submitPhone} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <SaudiPhoneInput value={phoneInput} onChange={setPhoneInput} autoFocus label={t("auth.mobile")} />
        <Button type="submit" className="w-full" loading={busy}>{t("auth.sendCode")}</Button>
        <p className="text-center text-xs text-slate-500">We will text you a 6-digit code. No password needed. New numbers get an account automatically.</p>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
        className="space-y-4"
        noValidate
      >
        {error && <Alert>{error}</Alert>}
        <div className="text-center text-sm text-slate-600">
          Enter the code sent to <span className="font-semibold text-slate-900" dir="ltr">{formatSaudiPhone(phone)}</span>
          {channel === "WHATSAPP" ? " on WhatsApp" : ""}.{" "}
          <button type="button" onClick={() => { setStep("phone"); setError(null); }} className="font-semibold text-brand-700 hover:underline">Change</button>
        </div>
        <OtpCodeInput value={code} onChange={setCode} onComplete={() => void verify()} disabled={busy} autoFocus error={!!error} />
        {devCode && (
          <Alert kind="info" className="text-xs">
            <span className="font-semibold">Development mode:</span> no SMS provider is configured, your code is <button type="button" className="font-mono font-bold underline" onClick={() => { setCode(devCode); }}>{devCode}</button>.
          </Alert>
        )}
        <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>Verify & continue</Button>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Didn&apos;t get it?</span>
          <ResendButton onResend={() => sendCode()} disabled={busy} resetKey={sendKey} />
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitProfile} className="space-y-4" noValidate>
      <Alert kind="info">
        <p className="font-semibold">Welcome! This number is new to MySupplier.</p>
        <p className="mt-0.5">Tell us your name to finish creating your account for <span className="font-mono" dir="ltr">{formatSaudiPhone(phone)}</span>.</p>
      </Alert>
      {error && <Alert>{error}</Alert>}
      <Input label={t("auth.name")} name="otpName" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} autoFocus required />
      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
        <span>
          <span className="block text-sm font-semibold text-slate-900">I am a supplier</span>
          <span className="block text-xs text-slate-500">Publish prices, receive RFQs and sell on MySupplier.</span>
        </span>
        <Toggle checked={isSupplier} onChange={setIsSupplier} label="I am a supplier" />
      </label>
      {isSupplier && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Company details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Company name" name="otpCompanyName" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} error={fieldErrors.companyName} required />
            <Input label="Company name (Arabic)" name="otpCompanyNameAr" dir="rtl" value={company.nameAr} onChange={(e) => setCompany({ ...company, nameAr: e.target.value })} />
            <Select label="Company type" name="otpCompanyType" value={company.type} onChange={(e) => setCompany({ ...company, type: e.target.value as CompanyType })} options={COMPANY_TYPES.map((c) => ({ value: c, label: c }))} />
            <Select label="City" name="otpCompanyCity" value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} error={fieldErrors.companyCity} required />
            <Input label="CR number" name="otpCrNumber" inputMode="numeric" dir="ltr" value={company.crNumber} onChange={(e) => setCompany({ ...company, crNumber: e.target.value })} error={fieldErrors.crNumber} hint="Commercial registration (10 digits)" />
            <Input label="VAT number" name="otpVatNumber" inputMode="numeric" dir="ltr" value={company.vatNumber} onChange={(e) => setCompany({ ...company, vatNumber: e.target.value })} error={fieldErrors.vatNumber} hint="15 digits" />
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">
        By continuing you agree to the{" "}
        <Link href="/terms" target="_blank" className="font-semibold text-brand-700 hover:underline">Terms of Service</Link> and{" "}
        <Link href="/privacy" target="_blank" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.
      </p>
      <Button type="submit" className="w-full" loading={busy}>{lang === "ar" ? "إنشاء الحساب" : "Create account"}</Button>
      <button type="button" onClick={() => { setStep("code"); setError(null); }} className="block w-full text-center text-xs font-semibold text-slate-500 hover:underline">← Back to the code</button>
    </form>
  );
}
