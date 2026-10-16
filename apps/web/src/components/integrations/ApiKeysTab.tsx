"use client";

import React, { useMemo, useState } from "react";
import type { ApiScope } from "@mysupplier/shared";
import { API_SCOPES } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { INTEGRATION_API_URL, integrationsApi, type ApiKeyCreated, type ApiKeyWithCreator, type ScopeInfo } from "@/lib/api/integrations";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, Modal, Table, type Column } from "@/components/ui";
import { CodeBlock, CopyButton, DEFAULT_SCOPES, Mono, SCOPE_GROUPS, SCOPE_GROUP_KEY, SCOPE_META, ScopeChips, localToIso, relevantTo, type Perspective } from "./shared";

type KeyState = "active" | "revoked" | "expired";

function keyState(k: ApiKeyWithCreator, now: number): KeyState {
  if (k.revokedAt) return "revoked";
  if (k.expiresAt && new Date(k.expiresAt).getTime() <= now) return "expired";
  return "active";
}

const STATE_TONE: Record<KeyState, "green" | "red" | "slate"> = { active: "green", revoked: "slate", expired: "red" };
const STATE_LABEL_KEY: Record<KeyState, TranslationKey> = { active: "integrations.keyActive", revoked: "integrations.keyRevoked", expired: "integrations.keyExpired" };

export function ApiKeysTab({ perspective, scopeInfo }: { perspective: Perspective; scopeInfo: ScopeInfo[] | null }) {
  const { t, lang } = useI18n();
  const state = useAsync(() => integrationsApi.keys(), []);
  const [flash, setFlash] = useFlash(6000);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(DEFAULT_SCOPES[perspective]);
  const [expiresAt, setExpiresAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyWithCreator | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);

  // Server-provided descriptions win over the local copy when available.
  const describe = useMemo(() => {
    const server = new Map((scopeInfo ?? []).map((s) => [s.scope, s.description]));
    return (scope: ApiScope) => server.get(scope) ?? t(SCOPE_META[scope].descriptionKey);
  }, [scopeInfo, t]);

  const now = Date.now();
  const all = state.data ?? [];
  const rows = showRevoked ? all : all.filter((k) => !k.revokedAt);
  const activeCount = all.filter((k) => keyState(k, now) === "active").length;
  const revokedCount = all.filter((k) => !!k.revokedAt).length;

  const openCreate = () => {
    setName("");
    setScopes(DEFAULT_SCOPES[perspective]);
    setExpiresAt("");
    setErrors({});
    setCreateOpen(true);
  };

  const toggleScope = (scope: ApiScope) => setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  const applyPreset = (preset: "recommended" | "readonly" | "all" | "none") => {
    if (preset === "recommended") setScopes(DEFAULT_SCOPES[perspective]);
    else if (preset === "readonly") setScopes(API_SCOPES.filter((s) => s.endsWith(":read")));
    else if (preset === "all") setScopes([...API_SCOPES]);
    else setScopes([]);
  };

  const save = async () => {
    const next: Record<string, string> = {};
    const trimmed = name.trim();
    if (trimmed.length < 2) next.name = t("integrations.errKeyName");
    else if (trimmed.length > 80) next.name = t("integrations.errKeyNameLong");
    if (scopes.length === 0) next.scopes = t("integrations.errScopes");
    const iso = localToIso(expiresAt);
    if (iso === undefined) next.expiresAt = t("integrations.errInvalidDate");
    else if (iso && new Date(iso).getTime() <= Date.now()) next.expiresAt = t("integrations.errExpiryFuture");
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const ordered = API_SCOPES.filter((s) => scopes.includes(s));
      const result = await integrationsApi.createKey({ name: trimmed, scopes: ordered, expiresAt: iso ?? null });
      state.setData((prev) => [result.apiKey, ...(prev ?? [])]);
      setCreateOpen(false);
      setCreated(result);
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const updated = await integrationsApi.revokeKey(revokeTarget.id);
      state.setData((prev) => (prev ? prev.map((k) => (k.id === updated.id ? { ...k, ...updated } : k)) : prev));
      setFlash({ kind: "success", message: `${t("integrations.keyRevokedPrefix")} "${revokeTarget.name}" ${t("integrations.keyRevokedSuffix")}` });
      setRevokeTarget(null);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setRevoking(false);
    }
  };

  const columns: Column<ApiKeyWithCreator>[] = [
    { key: "name", header: t("integrations.name"), render: (k) => (
      <div className="min-w-[140px]">
        <p className="font-medium text-slate-900">{k.name}</p>
        {k.createdBy?.name && <p className="text-xs text-slate-500">{t("integrations.by")} {k.createdBy.name}</p>}
      </div>
    ) },
    { key: "prefix", header: t("integrations.key"), render: (k) => <Mono title={t("integrations.prefixTitle")}>{k.prefix}…</Mono> },
    { key: "scopes", header: t("integrations.scopes"), render: (k) => <ScopeChips scopes={k.scopes} /> },
    { key: "created", header: t("orders.created"), render: (k) => <span className="whitespace-nowrap text-slate-500" title={formatDateTime(k.createdAt, lang)}>{formatDate(k.createdAt, lang)}</span> },
    { key: "used", header: t("integrations.lastUsed"), render: (k) => <span className="whitespace-nowrap text-slate-500" title={formatDateTime(k.lastUsedAt, lang)}>{k.lastUsedAt ? timeAgo(k.lastUsedAt) : t("integrations.never")}</span> },
    { key: "expires", header: t("integrations.expires"), render: (k) => <span className="whitespace-nowrap text-slate-500">{k.expiresAt ? formatDate(k.expiresAt, lang) : t("integrations.never")}</span> },
    { key: "state", header: t("common.status"), render: (k) => {
      const s = keyState(k, now);
      return <Badge tone={STATE_TONE[s]} title={k.revokedAt ? `${t("integrations.keyRevoked")} ${formatDateTime(k.revokedAt, lang)}` : undefined}>{t(STATE_LABEL_KEY[s])}</Badge>;
    } },
    { key: "actions", header: "", align: "end", render: (k) => (
      k.revokedAt ? <span className="text-xs text-slate-400">—</span> : <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRevokeTarget(k)}>{t("integrations.revoke")}</Button>
    ) },
  ];

  const pingSnippet = created ? `curl -H "X-API-Key: ${created.key}" ${INTEGRATION_API_URL}/ping` : "";

  return (
    <div className="space-y-4">
      <FlashMessage flash={flash} />
      <Card>
        <CardHeader
          title={t("integrations.apiKeys")}
          subtitle={`${activeCount} ${t("integrations.activeKeysNote")}`}
          action={
            <>
              {revokedCount > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
                  {t("integrations.showRevoked")} ({revokedCount})
                </label>
              )}
              <Button variant="accent" onClick={openCreate}>{t("integrations.createKeyPlus")}</Button>
            </>
          }
        />
        {state.loading ? <LoadingBlock /> : state.error ? <div className="p-5"><Alert onRetry={state.reload}>{state.error}</Alert></div> : (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(k) => k.id}
            empty={<EmptyState title={t("integrations.noKeys")} description={perspective === "supplier" ? t("integrations.noKeysSupplier") : t("integrations.noKeysBuyer")} action={<Button onClick={openCreate}>{t("integrations.createFirstKey")}</Button>} />}
          />
        )}
      </Card>

      {/* ---------------------------------------------------------------- create */}
      <Modal
        open={createOpen}
        wide
        title={t("integrations.createApiKey")}
        onClose={() => setCreateOpen(false)}
        footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button onClick={save} loading={saving}>{t("integrations.createKey")}</Button></>}
      >
        <div className="space-y-5">
          {errors.form && <Alert>{errors.form}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t("integrations.name")} name="keyName" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required placeholder={perspective === "supplier" ? t("integrations.keyNamePlaceholderSupplier") : t("integrations.keyNamePlaceholderBuyer")} hint={t("integrations.keyNameHint")} maxLength={80} />
            <Input label={t("integrations.expiresAt")} name="keyExpires" type="datetime-local" dir="ltr" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} error={errors.expiresAt} hint={t("integrations.expiresHint")} />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">{t("integrations.scopes")} <span className="text-red-500">*</span></p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <button type="button" onClick={() => applyPreset("recommended")} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">{perspective === "supplier" ? t("integrations.recommendedSuppliers") : t("integrations.recommendedBuyers")}</button>
                <button type="button" onClick={() => applyPreset("readonly")} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">{t("integrations.readOnly")}</button>
                <button type="button" onClick={() => applyPreset("all")} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">{t("integrations.all")}</button>
                <button type="button" onClick={() => applyPreset("none")} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">{t("integrations.none")}</button>
              </div>
            </div>
            {errors.scopes && <Alert className="mb-2">{errors.scopes}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              {SCOPE_GROUPS.map((group) => {
                const items = API_SCOPES.filter((s) => SCOPE_META[s].group === group);
                if (!items.length) return null;
                return (
                  <fieldset key={group} className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t(SCOPE_GROUP_KEY[group])}</legend>
                    <div className="space-y-2">
                      {items.map((scope) => {
                        const meta = SCOPE_META[scope];
                        const relevant = relevantTo(meta.audience, perspective);
                        return (
                          <label key={scope} className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-50 ${relevant ? "" : "opacity-70"}`}>
                            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium text-slate-800">{t(meta.labelKey)}</span>
                                <span dir="ltr" className="font-mono text-[11px] text-slate-500">{scope}</span>
                                {!relevant && <Badge tone="slate">{meta.audience === "supplier" ? t("integrations.supplierOnly") : t("integrations.buyerOnly")}</Badge>}
                              </span>
                              <span className="block text-xs text-slate-500">{describe(scope)}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </div>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {t("integrations.keyShownOnce1")} <strong>{t("integrations.once")}</strong> {t("integrations.keyShownOnce2")}
          </p>
        </div>
      </Modal>

      {/* ---------------------------------------------------------------- one-time reveal */}
      <Modal open={!!created} wide title={t("integrations.keyCreated")} onClose={() => setCreated(null)} footer={<Button onClick={() => setCreated(null)}>{t("integrations.storedKey")}</Button>}>
        {created && (
          <div className="space-y-4">
            <Alert kind="warning">
              <p className="font-semibold">{t("integrations.copyKeyNow")}</p>
              <p className="mt-1">{created.warning ?? t("integrations.keyHashNote")}</p>
            </Alert>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">{created.apiKey.name}</p>
              <div dir="ltr" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <code className="min-w-0 flex-1 select-all break-all font-mono text-sm text-emerald-900">{created.key}</code>
                <CopyButton text={created.key} label={t("integrations.copyKey")} />
              </div>
              <div className="mt-2"><ScopeChips scopes={created.apiKey.scopes} max={9} /></div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">{t("integrations.testNow")}</p>
              <CodeBlock title="bash" code={pingSnippet} compact />
              <p className="mt-1 text-xs text-slate-500">{t("integrations.sendKeyAs")} <Mono>X-API-Key</Mono> ({t("product.or")} <Mono>Authorization: ApiKey …</Mono>).</p>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------------------------------------------------------- revoke */}
      <Modal
        open={!!revokeTarget}
        title={t("integrations.revokeApiKey")}
        onClose={() => setRevokeTarget(null)}
        footer={<><Button variant="outline" onClick={() => setRevokeTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={revoke} loading={revoking}>{t("integrations.revokeKey")}</Button></>}
      >
        {revokeTarget && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>{t("integrations.revoke")} <span className="font-semibold text-slate-900">{revokeTarget.name}</span> (<Mono>{revokeTarget.prefix}…</Mono>){t("integrations.qm")}</p>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("integrations.revokeWarning")}</p>
            {revokeTarget.lastUsedAt && <p className="text-xs">{t("integrations.lastUsed")} {timeAgo(revokeTarget.lastUsedAt)} ({formatDateTime(revokeTarget.lastUsedAt, lang)}).</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
