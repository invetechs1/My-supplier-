"use client";

import { useState } from "react";
import type { Role, User } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Pagination, Select, StatusBadge, Table, type Column } from "@/components/ui";

const ROLES: Role[] = ["BUYER", "SUPPLIER", "ADMIN"];

export default function AdminUsersPage() {
  const { t, lang } = useI18n();
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.adminUsers({ q: q || undefined, role, page }), [q, role, page]);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState<string | null>(null);

  const changeRole = async (u: User, next: Role) => {
    if (next === u.role) return;
    if (!window.confirm(`Change ${u.email} from ${u.role} to ${next}?`)) return;
    setBusy(u.id);
    try {
      const updated = await api.adminUpdateUser(u.id, { role: next });
      state.setData((prev) => (prev ? { ...prev, data: prev.data.map((x) => (x.id === u.id ? { ...x, ...updated } : x)) } : prev));
      setFlash({ kind: "success", message: `${u.email} is now ${next}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<User>[] = [
    { key: "name", header: "User", render: (u) => (
      <div>
        <p className="font-medium text-slate-900">{u.name}{u.id === me?.id && <span className="ms-2 text-xs text-slate-400">(you)</span>}</p>
        <p className="text-xs text-slate-500">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
      </div>
    ) },
    { key: "role", header: "Role", render: (u) => <StatusBadge status={u.role} /> },
    { key: "company", header: "Company", render: (u) => u.company?.name ?? <span className="text-slate-400">—</span> },
    { key: "locale", header: "Locale", render: (u) => u.locale.toUpperCase() },
    { key: "created", header: "Joined", render: (u) => <span className="text-slate-500">{formatDate(u.createdAt, lang)}</span> },
    { key: "actions", header: "Change role", align: "end", render: (u) => (
      <Select name={`role-${u.id}`} value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} options={ROLES.map((r) => ({ value: r, label: r }))} disabled={busy === u.id || u.id === me?.id} className="inline-block w-36" />
    ) },
  ];

  return (
    <div>
      <PageHeader title={t("admin.users")} />
      <Card className="mb-4 p-4">
        <form onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }} className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" />
          <Select name="role" value={role} onChange={(e) => { setRole(e.target.value as Role | ""); setPage(1); }} placeholder="All roles" options={ROLES.map((r) => ({ value: r, label: r }))} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(u) => u.id} empty={<EmptyState title="No users found" />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
