"use client";

import React, { useState } from "react";
import type { CompanyInvite, CompanyRole, TeamMember } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { COMPANY_ROLES, companyRoleOf, useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Select, Table, Toggle, type Column } from "@/components/ui";
import { COMPANY_ROLE_KEY, RoleGuard } from "@/components/RoleGuard";

const COMPANY_ROLE_DESC_KEY: Record<CompanyRole, TranslationKey> = {
  OWNER: "sup.team.roleDesc.OWNER",
  MANAGER: "sup.team.roleDesc.MANAGER",
  SALES: "sup.team.roleDesc.SALES",
  WAREHOUSE: "sup.team.roleDesc.WAREHOUSE",
};

function TeamInner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const myRole = companyRoleOf(user);
  const roleOptions = COMPANY_ROLES.map((r) => ({ value: r, label: t(COMPANY_ROLE_KEY[r]) }));
  const state = useAsync(() => api.team(), []);
  const [flash, setFlash] = useFlash(6000);
  const [busy, setBusy] = useState<string | null>(null);

  const [invite, setInvite] = useState<{ email: string; name: string; role: CompanyRole }>({ email: "", name: "", role: "SALES" });
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const members = state.data?.members ?? [];
  const invites = (state.data?.invites ?? []).filter((i) => !i.acceptedAt);
  const ownerCount = members.filter((m) => m.companyRole === "OWNER" && m.active).length;

  const patchMember = async (m: TeamMember, body: { role?: CompanyRole; active?: boolean }) => {
    const previous = m;
    // Optimistic update; roll back on failure.
    state.setData((prev) => (prev ? { ...prev, members: prev.members.map((x) => (x.id === m.id ? { ...x, ...body } : x)) } : prev));
    setBusy(m.id);
    try {
      const updated = await api.updateMember(m.id, body);
      state.setData((prev) => (prev ? { ...prev, members: prev.members.map((x) => (x.id === m.id ? { ...x, ...updated } : x)) } : prev));
      setFlash({ kind: "success", message: `${t("sup.team.memberUpdated")} ${m.name}` });
    } catch (err) {
      state.setData((prev) => (prev ? { ...prev, members: prev.members.map((x) => (x.id === m.id ? previous : x)) } : prev));
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteErr(null);
    if (!/^\S+@\S+\.\S+$/.test(invite.email)) {
      setInviteErr(t("sup.team.errEmail"));
      return;
    }
    setInviting(true);
    try {
      const created = await api.inviteMember({ email: invite.email.trim(), role: invite.role, name: invite.name.trim() || undefined });
      state.setData((prev) => (prev ? { ...prev, invites: [created, ...prev.invites] } : prev));
      setInvite({ email: "", name: "", role: "SALES" });
      setFlash({ kind: "success", message: `${t("sup.team.inviteSentTo")} ${created.email}. ${t("sup.team.expiresIn7")}` });
    } catch (err) {
      setInviteErr(errorMessage(err));
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async (i: CompanyInvite) => {
    if (!window.confirm(`${t("sup.team.confirmCancel")} ${i.email}?`)) return;
    setBusy(i.id);
    try {
      await api.cancelInvite(i.id);
      state.setData((prev) => (prev ? { ...prev, invites: prev.invites.filter((x) => x.id !== i.id) } : prev));
      setFlash({ kind: "success", message: t("sup.team.inviteCancelled") });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<TeamMember>[] = [
    { key: "name", header: t("sup.team.member"), render: (m) => (
      <div>
        <p className="font-medium text-slate-900">{m.name}{m.id === user?.id && <Badge tone="blue" className="ms-2">{t("sup.team.you")}</Badge>}</p>
        <p className="text-xs text-slate-500" dir="ltr">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
      </div>
    ) },
    { key: "role", header: t("sup.team.role"), render: (m) => {
      const lastOwner = m.companyRole === "OWNER" && ownerCount <= 1;
      const locked = m.id === user?.id || lastOwner || (myRole === "MANAGER" && m.companyRole === "OWNER");
      return (
        <Select name={`role-${m.id}`} value={m.companyRole} options={roleOptions} disabled={locked || busy === m.id} onChange={(e) => patchMember(m, { role: e.target.value as CompanyRole })} className="w-36" aria-label={`${t("sup.team.roleOf")} ${m.name}`} title={lastOwner ? t("sup.team.lastOwner") : undefined} />
      );
    } },
    { key: "active", header: t("sup.team.active"), render: (m) => {
      const lastOwner = m.companyRole === "OWNER" && ownerCount <= 1;
      return <Toggle checked={m.active} disabled={m.id === user?.id || lastOwner || busy === m.id} onChange={(next) => patchMember(m, { active: next })} label={`${m.active ? t("sup.team.deactivate") : t("sup.team.activate")} ${m.name}`} />;
    } },
    { key: "login", header: t("sup.team.lastLogin"), render: (m) => <span className="text-slate-500" title={formatDateTime(m.lastLoginAt)}>{m.lastLoginAt ? timeAgo(m.lastLoginAt) : t("sup.team.never")}</span> },
    { key: "joined", header: t("sup.team.joined"), render: (m) => <span className="text-slate-500">{formatDateTime(m.createdAt)}</span> },
  ];

  const inviteColumns: Column<CompanyInvite>[] = [
    { key: "email", header: t("auth.email"), render: (i) => <span className="font-medium text-slate-900" dir="ltr">{i.email}</span> },
    { key: "role", header: t("sup.team.role"), render: (i) => <Badge tone="slate">{t(COMPANY_ROLE_KEY[i.role])}</Badge> },
    { key: "by", header: t("sup.team.invitedBy"), render: (i) => i.invitedBy?.name ?? "—" },
    { key: "expires", header: t("sup.team.expires"), render: (i) => {
      const expired = new Date(i.expiresAt).getTime() < Date.now();
      return expired ? <Badge tone="red">{t("sup.team.expired")}</Badge> : <span className="text-slate-500">{formatDateTime(i.expiresAt)}</span>;
    } },
    { key: "actions", header: "", align: "end", render: (i) => <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancelInvite(i)} loading={busy === i.id}>{t("common.cancel")}</Button> },
  ];

  return (
    <div>
      <PageHeader title={t("sup.team")} subtitle={t("sup.team.subtitle")} />
      <FlashMessage flash={flash} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("sup.team.members")} subtitle={`${members.length} ${members.length === 1 ? t("sup.team.personOne") : t("sup.team.personMany")}`} />
          {state.loading ? <LoadingBlock /> : state.error ? <div className="p-5"><Alert onRetry={state.reload}>{state.error}</Alert></div> : (
            <Table columns={columns} rows={members} rowKey={(m) => m.id} empty={<EmptyState title={t("sup.team.noMembers")} />} />
          )}
        </Card>

        <Card>
          <CardHeader title={t("sup.team.inviteTitle")} subtitle={t("sup.team.inviteSubtitle")} />
          <CardBody>
            <form onSubmit={sendInvite} className="space-y-3" noValidate>
              {inviteErr && <Alert>{inviteErr}</Alert>}
              <Input label={t("auth.email")} name="inviteEmail" type="email" dir="ltr" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
              <Input label={t("sup.team.nameOptional")} name="inviteName" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              <Select label={t("sup.team.role")} name="inviteRole" value={invite.role} options={roleOptions.filter((o) => myRole === "OWNER" || o.value !== "OWNER")} onChange={(e) => setInvite({ ...invite, role: e.target.value as CompanyRole })} />
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{t(COMPANY_ROLE_DESC_KEY[invite.role])}</p>
              <Button type="submit" className="w-full" loading={inviting}>{t("sup.team.sendInvite")}</Button>
            </form>
            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {COMPANY_ROLES.map((r) => (
                <div key={r}><dt className="inline font-semibold text-slate-700">{t(COMPANY_ROLE_KEY[r])}: </dt><dd className="inline">{t(COMPANY_ROLE_DESC_KEY[r])}</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={t("sup.team.pending")} subtitle={t("sup.team.pendingSubtitle")} />
        {state.loading ? <LoadingBlock /> : (
          <Table columns={inviteColumns} rows={invites} rowKey={(i) => i.id} empty={<EmptyState title={t("sup.team.noPending")} />} />
        )}
      </Card>
    </div>
  );
}

export default function SupplierTeamPage() {
  return (
    <RoleGuard area="team">
      <TeamInner />
    </RoleGuard>
  );
}
