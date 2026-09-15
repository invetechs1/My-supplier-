"use client";
import React from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { homeForRole, useAuth } from "@/lib/auth";
import { useFlash, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Select, VerifiedBadge } from "@/components/ui";

export default function AccountPage() {
  const { t, lang, setLang } = useI18n();
  const { user, loading, refresh, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  usePageTitle(t("nav.account"));

  const [profile, setProfile] = useState({ name: "", phone: "", locale: "en" as "en" | "ar" });
  const [profileFlash, setProfileFlash] = useFlash();
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwFlash, setPwFlash] = useFlash();
  const [savingPw, setSavingPw] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (user) setProfile({ name: user.name ?? "", phone: user.phone ?? "", locale: user.locale ?? "en" });
  }, [user]);

  if (loading || !user) return <LoadingBlock label={t("common.loading")} className="min-h-[60vh]" />;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.name.trim().length < 2) {
      setProfileFlash({ kind: "error", message: "Please enter your full name." });
      return;
    }
    setSavingProfile(true);
    try {
      await api.updateMe({ name: profile.name.trim(), phone: profile.phone.trim() || undefined, locale: profile.locale });
      await refresh();
      if (profile.locale !== lang) setLang(profile.locale);
      setProfileFlash({ kind: "success", message: "Profile updated." });
    } catch (err) {
      setProfileFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!pw.current) return setPwError("Enter your current password.");
    if (pw.next.length < 8) return setPwError("New password must be at least 8 characters.");
    if (pw.next !== pw.confirm) return setPwError("New passwords do not match.");
    if (pw.next === pw.current) return setPwError("Choose a password different from the current one.");
    setSavingPw(true);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setPwFlash({ kind: "success", message: "Password changed." });
    } catch (err) {
      setPwError(errorMessage(err, "Could not change the password."));
    } finally {
      setSavingPw(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteMe();
      setDeleteOpen(false);
      logout();
      router.push("/");
    } catch (err) {
      setDeleteError(errorMessage(err, "Could not delete the account."));
    } finally {
      setDeleting(false);
    }
  };

  const initials = user.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title={t("nav.account")}
        subtitle="Manage your profile, password and account."
        action={
          <Link href={homeForRole(user.role)} className="text-sm font-semibold text-brand-700 hover:underline">
            ← {t("nav.dashboard")}
          </Link>
        }
      />

      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">{initials || "U"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={user.role === "ADMIN" ? "purple" : user.role === "SUPPLIER" ? "green" : "blue"}>{user.role}</Badge>
            {user.company && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                {user.company.name} <VerifiedBadge verified={user.company.verified} />
              </span>
            )}
            <span className="text-xs text-slate-400">Member since {formatDate(user.createdAt, lang)}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" subtitle="Your name and phone appear on RFQs, bids and invoices." />
          <CardBody>
            <form onSubmit={saveProfile} className="space-y-4" noValidate>
              <FlashMessage flash={profileFlash} />
              <Input label="Full name" name="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
              <Input label="Email" name="email" value={user.email} disabled hint="Contact support to change your email address." dir="ltr" />
              <Input label="Phone" name="phone" type="tel" dir="ltr" placeholder="+9665XXXXXXXX" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Select label="Preferred language" name="locale" value={profile.locale} onChange={(e) => setProfile({ ...profile, locale: e.target.value as "en" | "ar" })} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]} />
              <Button type="submit" loading={savingProfile}>{t("common.save")}</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Change password" subtitle="Use at least 8 characters. You stay signed in on this device." />
          <CardBody>
            <form onSubmit={changePassword} className="space-y-4" noValidate>
              <FlashMessage flash={pwFlash} />
              {pwError && <Alert>{pwError}</Alert>}
              <Input label="Current password" name="currentPassword" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
              <Input label="New password" name="newPassword" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
              <Input label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
              <Button type="submit" variant="outline" loading={savingPw}>Update password</Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6 border-red-200">
        <CardHeader title={<span className="text-red-700">Danger zone</span>} subtitle="Deleting your account deactivates it and removes your access. Orders and invoices are retained as required by Saudi tax regulations." />
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">This cannot be undone from the app. Contact support if you change your mind.</p>
          <Button variant="danger" onClick={() => { setDeleteConfirm(""); setDeleteError(null); setDeleteOpen(true); }}>
            Delete my account
          </Button>
        </CardBody>
      </Card>

      <Modal
        open={deleteOpen}
        title="Delete your account?"
        onClose={() => (deleting ? undefined : setDeleteOpen(false))}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={deleteAccount} loading={deleting} disabled={deleteConfirm.trim().toUpperCase() !== "DELETE"}>
              Permanently delete
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>Your account <strong className="text-slate-900">{user.email}</strong> will be deactivated immediately and you will be signed out. Open RFQs and bids will be closed.</p>
          {deleteError && <Alert>{deleteError}</Alert>}
          <Input label="Type DELETE to confirm" name="deleteConfirm" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} autoComplete="off" dir="ltr" />
        </div>
      </Modal>
    </div>
  );
}
