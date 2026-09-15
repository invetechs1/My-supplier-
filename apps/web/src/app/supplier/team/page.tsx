"use client";

import React, { useState } from "react";
import type { CompanyInvite, CompanyRole, TeamMember } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { COMPANY_ROLES, COMPANY_ROLE_DESCRIPTION, COMPANY_ROLE_LABEL, companyRoleOf, useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Select, Table, Toggle, type Column } from "@/components/ui";
import { RoleGuard } from "@/components/RoleGuard";

const roleOptions = COMPANY_ROLES.map((r) => ({ value: r, label: COMPANY_ROLE_LABEL[r] }));

function TeamInner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const myRole = companyRoleOf(user);
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
      setFlash({ kind: "success", message: `${m.name} updated.` });
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
      setInviteErr("Enter a valid email address.");
      return;
    }
    setInviting(true);
    try {
      const created = await api.inviteMember({ email: invite.email.trim(), role: invite.role, name: invite.name.trim() || undefined });
      state.setData((prev) => (prev ? { ...prev, invites: [created, ...prev.invites] } : prev));
      setInvite({ email: "", name: "", role: "SALES" });
      setFlash({ kind: "success", message: `Invitation sent to ${created.email}. It expires in 7 days.` });
    } catch (err) {
      setInviteErr(errorMessage(err));
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async (i: CompanyInvite) => {
    if (!window.confirm(`Cancel the invitation for ${i.email}?`)) return;
    setBusy(i.id);
    try {
      await api.cancelInvite(i.id);
      state.setData((prev) => (prev ? { ...prev, invites: prev.invites.filter((x) => x.id !== i.id) } : prev));
      setFlash({ kind: "success", message: "Invitation cancelled." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<TeamMember>[] = [
    { key: "name", header: "Member", render: (m) => (
      <div>
        <p className="font-medium text-slate-900">{m.name}{m.id === user?.id && <Badge tone="blue" className="ms-2">You</Badge>}</p>
        <p className="text-xs text-slate-500" dir="ltr">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
      </div>
    ) },
    { key: "role", header: "Role", render: (m) => {
      const lastOwner = m.companyRole === "OWNER" && ownerCount <= 1;
      const locked = m.id === user?.id || lastOwner || (myRole === "MANAGER" && m.companyRole === "OWNER");
      return (
        <Select name={`role-${m.id}`} value={m.companyRole} options={roleOptions} disabled={locked || busy === m.id} onChange={(e) => patchMember(m, { role: e.target.value as CompanyRole })} className="w-36" aria-label={`Role of ${m.name}`} title={lastOwner ? "The last owner cannot be demoted" : undefined} />
      );
    } },
    { key: "active", header: "Active", render: (m) => {
      const lastOwner = m.companyRole === "OWNER" && ownerCount <= 1;
      return <Toggle checked={m.active} disabled={m.id === user?.id || lastOwner || busy === m.id} onChange={(next) => patchMember(m, { active: next })} label={`${m.active ? "Deactivate" : "Activate"} ${m.name}`} />;
    } },
    { key: "login", header: "Last login", render: (m) => <span className="text-slate-500" title={formatDateTime(m.lastLoginAt)}>{m.lastLoginAt ? timeAgo(m.lastLoginAt) : "Never"}</span> },
    { key: "joined", header: "Joined", render: (m) => <span className="text-slate-500">{formatDateTime(m.createdAt)}</span> },
  ];

  const inviteColumns: Column<CompanyInvite>[] = [
    { key: "email", header: "Email", render: (i) => <span className="font-medium text-slate-900" dir="ltr">{i.email}</span> },
    { key: "role", header: "Role", render: (i) => <Badge tone="slate">{COMPANY_ROLE_LABEL[i.role]}</Badge> },
    { key: "by", header: "Invited by", render: (i) => i.invitedBy?.name ?? "—" },
    { key: "expires", header: "Expires", render: (i) => {
      const expired = new Date(i.expiresAt).getTime() < Date.now();
      return expired ? <Badge tone="red">Expired</Badge> : <span className="text-slate-500">{formatDateTime(i.expiresAt)}</span>;
    } },
    { key: "actions", header: "", align: "end", render: (i) => <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancelInvite(i)} loading={busy === i.id}>Cancel</Button> },
  ];

  return (
    <div>
      <PageHeader title={t("sup.team")} subtitle="Invite colleagues and control what each of them can do in your company account." />
      <FlashMessage flash={flash} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Members" subtitle={`${members.length} ${members.length === 1 ? "person" : "people"}`} />
          {state.loading ? <LoadingBlock /> : state.error ? <div className="p-5"><Alert onRetry={state.reload}>{state.error}</Alert></div> : (
            <Table columns={columns} rows={members} rowKey={(m) => m.id} empty={<EmptyState title="No members yet" />} />
          )}
        </Card>

        <Card>
          <CardHeader title="Invite a colleague" subtitle="They get an email with a link to join your company." />
          <CardBody>
            <form onSubmit={sendInvite} className="space-y-3" noValidate>
              {inviteErr && <Alert>{inviteErr}</Alert>}
              <Input label="Email" name="inviteEmail" type="email" dir="ltr" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
              <Input label="Name (optional)" name="inviteName" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              <Select label="Role" name="inviteRole" value={invite.role} options={roleOptions.filter((o) => myRole === "OWNER" || o.value !== "OWNER")} onChange={(e) => setInvite({ ...invite, role: e.target.value as CompanyRole })} />
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{COMPANY_ROLE_DESCRIPTION[invite.role]}</p>
              <Button type="submit" className="w-full" loading={inviting}>Send invitation</Button>
            </form>
            <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {COMPANY_ROLES.map((r) => (
                <div key={r}><dt className="inline font-semibold text-slate-700">{COMPANY_ROLE_LABEL[r]}: </dt><dd className="inline">{COMPANY_ROLE_DESCRIPTION[r]}</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Pending invitations" subtitle="Links expire after 7 days." />
        {state.loading ? <LoadingBlock /> : (
          <Table columns={inviteColumns} rows={invites} rowKey={(i) => i.id} empty={<EmptyState title="No pending invitations" />} />
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
