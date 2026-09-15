"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SAUDI_CITIES, type CompanyProfile } from "@mysupplier/shared";
import { api, errorMessage, fileUrl, type CompanyProfilePatch } from "@/lib/api";
import { canManageCompany, companyRoleOf, useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, FlashMessage, Input, Label, LoadingBlock, PageHeader, Textarea, VerificationBadge } from "@/components/ui";
import { RoleGuard } from "@/components/RoleGuard";

interface FormState {
  name: string;
  nameAr: string;
  slug: string;
  description: string;
  descriptionAr: string;
  citiesServed: string[];
  minOrderValue: string;
  deliveryFee: string;
  deliveryDays: string;
  workingHours: string;
  phone: string;
  email: string;
  website: string;
  lowStockThreshold: string;
  bankName: string;
  iban: string;
  beneficiary: string;
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function toForm(c: CompanyProfile): FormState {
  return {
    name: c.name ?? "",
    nameAr: str(c.nameAr),
    slug: str(c.slug),
    description: str(c.description),
    descriptionAr: str(c.descriptionAr),
    citiesServed: Array.isArray(c.citiesServed) ? [...c.citiesServed] : [],
    minOrderValue: str(c.minOrderValue),
    deliveryFee: str(c.deliveryFee),
    deliveryDays: str(c.deliveryDays),
    workingHours: str(c.workingHours),
    phone: str(c.phone),
    email: str(c.email),
    website: str(c.website),
    lowStockThreshold: str(c.lowStockThreshold ?? 10),
    bankName: str(c.bankName),
    iban: str(c.iban),
    beneficiary: str(c.beneficiary),
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

function LogoUploader({ company, canEdit, onUploaded, onError }: { company: CompanyProfile; canEdit: boolean; onUploaded: (c: CompanyProfile) => void; onError: (m: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = preview ?? fileUrl(company.logoUrl);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = async (f: File | null | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) {
      onError("Logo must be a PNG, JPG or WEBP image.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      onError("Logo must be 2 MB or smaller.");
      return;
    }
    setPreview(URL.createObjectURL(f));
    setBusy(true);
    try {
      const updated = await api.uploadCompanyLogo(f);
      onUploaded(updated);
    } catch (err) {
      onError(errorMessage(err, "Could not upload the logo."));
      setPreview(null);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={`${company.name} logo`} className="h-full w-full object-contain" />
        ) : (
          <span className="text-2xl font-semibold text-slate-400">{company.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-slate-600">Square PNG, JPG or WEBP up to 2 MB. Shown on your storefront, in the shop and on invoices.</p>
        {canEdit && (
          <>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} loading={busy}>
              {company.logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CompanyPageInner() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const role = companyRoleOf(user);
  const canEdit = user?.role === "ADMIN" || canManageCompany(role);
  const state = useAsync(() => api.supplierCompany(), []);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useFlash(6000);
  const [cityQuery, setCityQuery] = useState("");

  useEffect(() => {
    if (state.data && !form) setForm(toForm(state.data));
  }, [state.data, form]);

  const dirty = useMemo(() => (state.data && form ? JSON.stringify(toForm(state.data)) !== JSON.stringify(form) : false), [state.data, form]);
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "";

  if (state.loading || !form) return <LoadingBlock />;
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? "Could not load your company profile"}</Alert>;
  const c = state.data;
  const publicHref = `/suppliers/${c.slug || c.id}`;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const toggleCity = (city: string) => set("citiesServed", form.citiesServed.includes(city) ? form.citiesServed.filter((x) => x !== city) : [...form.citiesServed, city]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Company name is required.";
    if (form.slug && !/^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/.test(form.slug)) next.slug = "Use lowercase letters, numbers and hyphens only.";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email.";
    if (form.website && !/^https?:\/\//i.test(form.website)) next.website = "Start with http:// or https://";
    for (const key of ["minOrderValue", "deliveryFee", "deliveryDays", "lowStockThreshold"] as const) {
      const v = form[key];
      if (v.trim() !== "" && (Number.isNaN(Number(v)) || Number(v) < 0)) next[key] = "Must be a positive number.";
    }
    if (form.iban && !/^SA\d{22}$/i.test(form.iban.replace(/\s+/g, ""))) next.iban = "Saudi IBANs are 'SA' followed by 22 digits.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !validate()) return;
    const body: CompanyProfilePatch = {
      name: form.name.trim(),
      nameAr: form.nameAr.trim() || null,
      slug: form.slug.trim() || null,
      description: form.description.trim() || null,
      descriptionAr: form.descriptionAr.trim() || null,
      citiesServed: form.citiesServed,
      minOrderValue: numOrNull(form.minOrderValue),
      deliveryFee: numOrNull(form.deliveryFee),
      deliveryDays: numOrNull(form.deliveryDays),
      workingHours: form.workingHours.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      bankName: form.bankName.trim() || null,
      iban: form.iban.replace(/\s+/g, "").toUpperCase() || null,
      beneficiary: form.beneficiary.trim() || null,
      lowStockThreshold: form.lowStockThreshold.trim() === "" ? undefined : Number(form.lowStockThreshold),
    };
    setSaving(true);
    try {
      const updated = await api.updateSupplierCompany(body);
      state.setData(updated);
      setForm(toForm(updated));
      setFlash({ kind: "success", message: "Company profile saved." });
      void refresh();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const filteredCities = SAUDI_CITIES.filter((city) => city.toLowerCase().includes(cityQuery.toLowerCase()));

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        title={t("sup.company")}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            What buyers see on your public storefront.
            <VerificationBadge status={c.verificationStatus} />
            {!canEdit && <Badge tone="slate">Read-only for your role</Badge>}
          </span>
        }
        action={
          <>
            <Link href={publicHref} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View public page ↗
            </Link>
            {canEdit && <Button type="submit" loading={saving} disabled={!dirty}>{t("common.save")}</Button>}
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />
      {c.verificationStatus === "REJECTED" && c.verificationNotes && (
        <Alert kind="error" className="mb-4"><span className="font-semibold">Verification rejected:</span> {c.verificationNotes} <Link href="/supplier/documents" className="font-semibold underline">Upload new documents</Link></Alert>
      )}

      <fieldset disabled={!canEdit} className="space-y-6">
        <Card>
          <CardHeader title="Logo" />
          <CardBody>
            <LogoUploader company={c} canEdit={canEdit} onUploaded={(updated) => { state.setData(updated); setFlash({ kind: "success", message: "Logo updated." }); void refresh(); }} onError={(m) => setFlash({ kind: "error", message: m })} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Identity" subtitle="Name, public URL and description in English and Arabic." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input label="Company name" name="name" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} required />
            <Input label="Company name (Arabic)" name="nameAr" dir="rtl" value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
            <div className="sm:col-span-2">
              <Input
                label="Storefront URL slug"
                name="slug"
                dir="ltr"
                value={form.slug}
                onChange={(e) => set("slug", slugify(e.target.value))}
                onBlur={() => !form.slug && set("slug", slugify(form.name))}
                placeholder={slugify(form.name) || "your-company"}
                error={errors.slug}
                hint={`Public page: ${siteOrigin}/suppliers/${form.slug || slugify(form.name) || "<slug>"}`}
              />
            </div>
            <Textarea label="Description (English)" name="description" rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What you supply, which projects you have served, certifications, delivery capacity…" />
            <Textarea label="Description (Arabic)" name="descriptionAr" dir="rtl" rows={5} value={form.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Delivery & service area" subtitle="Buyers only see your offers and RFQs in the cities you serve." />
          <CardBody className="space-y-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label>Cities served</Label>
                <div className="flex items-center gap-2">
                  <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="Filter cities…" className="h-8 w-40 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Filter cities" />
                  {canEdit && (
                    <>
                      <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => set("citiesServed", [...SAUDI_CITIES])}>All</button>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:underline" onClick={() => set("citiesServed", [])}>None</button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredCities.map((city) => {
                  const on = form.citiesServed.includes(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => canEdit && toggleCity(city)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition",
                        on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-400",
                        !canEdit && "cursor-default",
                      )}
                    >
                      {on ? "✓ " : ""}{city}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">{form.citiesServed.length} of {SAUDI_CITIES.length} cities selected{form.citiesServed.length === 0 ? ` – defaults to ${c.city}` : ""}.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Minimum order value (SAR)" name="minOrderValue" type="number" min={0} step="0.01" dir="ltr" value={form.minOrderValue} onChange={(e) => set("minOrderValue", e.target.value)} error={errors.minOrderValue} />
              <Input label="Delivery fee (SAR)" name="deliveryFee" type="number" min={0} step="0.01" dir="ltr" value={form.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} error={errors.deliveryFee} hint="Per order, charged at checkout" />
              <Input label="Delivery time (days)" name="deliveryDays" type="number" min={0} dir="ltr" value={form.deliveryDays} onChange={(e) => set("deliveryDays", e.target.value)} error={errors.deliveryDays} />
              <Input label="Working hours" name="workingHours" value={form.workingHours} onChange={(e) => set("workingHours", e.target.value)} placeholder="Sat–Thu 8:00–18:00" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contact" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Input label="Phone" name="phone" type="tel" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+9665XXXXXXXX" />
            <Input label="Email" name="email" type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
            <Input label="Website" name="website" type="url" dir="ltr" value={form.website} onChange={(e) => set("website", e.target.value)} error={errors.website} placeholder="https://" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Inventory" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Input label="Low-stock threshold" name="lowStockThreshold" type="number" min={0} dir="ltr" value={form.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} error={errors.lowStockThreshold} hint="Items at or below this quantity are flagged and trigger a daily alert." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Bank details for payouts" subtitle="Used by MySupplier to pay out card orders. Never shown publicly." />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Input label="Bank name" name="bankName" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="Al Rajhi Bank" />
            <Input label="IBAN" name="iban" dir="ltr" value={form.iban} onChange={(e) => set("iban", e.target.value)} error={errors.iban} placeholder="SA00 0000 0000 0000 0000 0000" className="font-mono" />
            <Input label="Beneficiary name" name="beneficiary" value={form.beneficiary} onChange={(e) => set("beneficiary", e.target.value)} hint="Exactly as on the bank account" />
          </CardBody>
        </Card>
      </fieldset>

      {canEdit && (
        <div className="sticky bottom-4 mt-6 flex justify-end">
          <div className={cn("flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-card-hover transition", dirty ? "border-amber-300" : "border-slate-200")}>
            <span className="text-sm text-slate-600">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
            <Button type="submit" loading={saving} disabled={!dirty}>{t("common.save")}</Button>
          </div>
        </div>
      )}
    </form>
  );
}

export default function SupplierCompanyPage() {
  return (
    <RoleGuard area="company">
      <CompanyPageInner />
    </RoleGuard>
  );
}
