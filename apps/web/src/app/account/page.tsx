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
import { formatSaudiPhone, normaliseSaudiPhone } from "@/lib/phone";
import { Alert, Badge, Button, Card, CardBody, CardHeader, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Select, VerifiedBadge } from "@/components/ui";
import { OtpCodeInput } from "@/components/OtpCodeInput";
import { ResendButton } from "@/components/PhoneOtpLogin";

/** Green "Phone verified" pill shown next to the phone field and in the profile header. */
function PhoneVerifiedBadge() {
  return (
    <Badge tone="green" className="gap-1">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
      </svg>
      Phone verified
    </Badge>
  );
}

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

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyPhone, setVerifyPhone] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyDevCode, setVerifyDevCode] = useState<string | null>(null);
  const [verifyKey, setVerifyKey] = useState(0);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

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

  const phoneVerified = !!user.phoneVerified;
  const savedPhone = normaliseSaudiPhone(user.phone ?? "");
  const phoneDirty = profile.phone.trim() !== (user.phone ?? "").trim();

  const startVerifyPhone = async () => {
    const target = normaliseSaudiPhone(profile.phone);
    if (!target) {
      setProfileFlash({ kind: "error", message: "Enter a valid Saudi mobile number (05xxxxxxxx) first." });
      return;
    }
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      if (phoneDirty) {
        // The API verifies the phone on the account, so persist it before requesting the code.
        await api.updateMe({ phone: target });
        await refresh();
      }
      const res = await api.otpRequest({ phone: target, purpose: "VERIFY_PHONE" });
      setVerifyPhone(target);
      setVerifyDevCode(res.devCode ?? null);
      setVerifyCode("");
      setVerifyKey((k) => k + 1);
      setVerifyOpen(true);
    } catch (err) {
      setProfileFlash({ kind: "error", message: errorMessage(err, "Could not send the verification code.") });
    } finally {
      setVerifyBusy(false);
    }
  };

  const resendVerifyCode = async () => {
    if (!verifyPhone) return;
    setVerifyError(null);
    try {
      const res = await api.otpRequest({ phone: verifyPhone, purpose: "VERIFY_PHONE" });
      setVerifyDevCode(res.devCode ?? null);
      setVerifyCode("");
      setVerifyKey((k) => k + 1);
    } catch (err) {
      setVerifyError(errorMessage(err));
    }
  };

  const confirmVerifyPhone = async (code = verifyCode) => {
    if (code.length !== 6) return;
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      await api.verifyPhone(code);
      await refresh();
      setVerifyOpen(false);
      setProfileFlash({ kind: "success", message: "Phone number verified." });
    } catch (err) {
      setVerifyError(errorMessage(err, "Invalid or expired code."));
    } finally {
      setVerifyBusy(false);
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
            {phoneVerified && <PhoneVerifiedBadge />}
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
              <div>
                <Input label="Phone" name="phone" type="tel" dir="ltr" placeholder="+9665XXXXXXXX" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {phoneVerified && !phoneDirty ? (
                    <>
                      <PhoneVerifiedBadge />
                      <span className="text-xs text-slate-500">{formatSaudiPhone(savedPhone)} can receive order updates by SMS.</span>
                    </>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={startVerifyPhone} loading={verifyBusy && !verifyOpen} disabled={!normaliseSaudiPhone(profile.phone)}>
                        Verify phone
                      </Button>
                      <span className="text-xs text-slate-500">{phoneVerified && phoneDirty ? "Changing the number requires verifying it again." : "We will text a 6-digit code to confirm the number."}</span>
                    </>
                  )}
                </div>
              </div>
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
        open={verifyOpen}
        title="Verify your phone"
        onClose={() => (verifyBusy ? undefined : setVerifyOpen(false))}
        footer={
          <>
            <Button variant="outline" onClick={() => setVerifyOpen(false)} disabled={verifyBusy}>{t("common.cancel")}</Button>
            <Button onClick={() => confirmVerifyPhone()} loading={verifyBusy} disabled={verifyCode.length !== 6}>Confirm</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate-600">
          <p>Enter the 6-digit code we sent to <span className="font-semibold text-slate-900" dir="ltr">{formatSaudiPhone(verifyPhone)}</span>.</p>
          {verifyError && <Alert>{verifyError}</Alert>}
          <OtpCodeInput value={verifyCode} onChange={setVerifyCode} onComplete={(c) => void confirmVerifyPhone(c)} disabled={verifyBusy} autoFocus error={!!verifyError} />
          {verifyDevCode && (
            <Alert kind="info" className="text-xs">
              <span className="font-semibold">Development mode:</span> your code is <button type="button" className="font-mono font-bold underline" onClick={() => setVerifyCode(verifyDevCode)}>{verifyDevCode}</button>.
            </Alert>
          )}
          <div className="flex justify-end">
            <ResendButton onResend={resendVerifyCode} disabled={verifyBusy} resetKey={verifyKey} />
          </div>
        </div>
      </Modal>

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
