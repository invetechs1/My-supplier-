"use client";

import React, { useEffect, useState } from "react";
import { useAuth, canManageCompany, companyRoleOf, COMPANY_ROLE_LABEL } from "@/lib/auth";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { INTEGRATION_API_URL, integrationsApi } from "@/lib/api/integrations";
import { Alert, Badge, Card, CardBody, LinkButton, LoadingBlock, PageHeader } from "@/components/ui";
import { ApiKeysTab } from "./ApiKeysTab";
import { WebhooksTab } from "./WebhooksTab";
import { DeveloperGuideTab } from "./DeveloperGuideTab";
import { CodeBlock, CopyButton, Mono, Tabs, type Perspective } from "./shared";

type TabKey = "keys" | "webhooks" | "guide";
const TAB_KEYS: TabKey[] = ["keys", "webhooks", "guide"];

function isTabKey(v: string): v is TabKey {
  return (TAB_KEYS as string[]).includes(v);
}

/**
 * Shared ERP / API console used by /supplier/integrations and /dashboard/integrations.
 * The API is the same for both sides; `perspective` only changes defaults, samples and copy.
 */
export function IntegrationsConsole({ perspective }: { perspective: Perspective }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const title = t(perspective === "supplier" ? "sup.integrations" : "dash.integrations");
  usePageTitle(title);

  const [tab, setTab] = useState<TabKey>("keys");
  // Deep-linkable tabs (#webhooks) without useSearchParams (which needs a Suspense boundary).
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    if (isTabKey(fromHash)) setTab(fromHash);
  }, []);
  const changeTab = (next: TabKey) => {
    setTab(next);
    try {
      window.history.replaceState(null, "", `#${next}`);
    } catch {
      /* ignore */
    }
  };

  const hasCompany = !!(user?.companyId || user?.company);
  const role = companyRoleOf(user);
  const canManage = user?.role === "ADMIN" || (hasCompany && canManageCompany(role));
  const scopesState = useAsync(() => integrationsApi.scopes(), [], !!user && canManage);

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(INTEGRATION_API_URL);
  const pingCurl = `curl -H "X-API-Key: $MYSUPPLIER_API_KEY" ${INTEGRATION_API_URL}/ping`;

  if (loading && !user) return <LoadingBlock />;

  const notice = !hasCompany ? (
    <Card>
      <CardBody>
        <Alert kind="info">
          <p className="font-semibold">Integration keys are issued per company.</p>
          <p className="mt-1">
            {perspective === "buyer"
              ? "Your account is not linked to a company yet. Add your company details (name, CR and VAT numbers) in your account settings, then come back here to create API keys and webhooks for your procurement system."
              : "Your account is not linked to a company yet. Complete your company profile first, then come back here to create API keys and webhooks."}
          </p>
        </Alert>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/account" variant="primary">Go to account settings</LinkButton>
          <button type="button" onClick={() => changeTab("guide")} className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Read the developer guide</button>
        </div>
      </CardBody>
    </Card>
  ) : !canManage ? (
    <Card>
      <CardBody>
        <Alert kind="warning">
          <p className="font-semibold">Only company owners and managers can manage API keys and webhooks.</p>
          <p className="mt-1">Your role in {user?.company?.name ?? "your company"} is {COMPANY_ROLE_LABEL[role]}. Ask an owner or manager to create the key for your ERP, or to change your role. You can still read the developer guide.</p>
        </Alert>
        <div className="mt-4">
          <button type="button" onClick={() => changeTab("guide")} className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Open the developer guide</button>
        </div>
      </CardBody>
    </Card>
  ) : null;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={
          perspective === "supplier"
            ? "Connect SAP, Oracle Fusion, Dynamics 365, Odoo, Zoho or a custom system: push prices and stock, pull sales orders, push fulfilment status and receive events by webhook."
            : "Connect your procurement or accounting system: look up best offers, raise RFQs, pull purchases and ZATCA e-invoices, and receive order events by webhook."
        }
      />

      {/* Connection status */}
      <Card className="mb-6">
        <div className="grid gap-4 p-5 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Connection</h3>
              <Badge tone={isLocal ? "amber" : "green"}>{isLocal ? "Local development" : "Production"}</Badge>
              {user?.company?.name && <Badge tone="slate">{user.company.name}</Badge>}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Base URL</p>
              <div dir="ltr" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-800" title={INTEGRATION_API_URL}>{INTEGRATION_API_URL}</code>
                <CopyButton text={INTEGRATION_API_URL} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600">
              <dt className="font-medium text-slate-700">Auth header</dt>
              <dd><Mono>X-API-Key: msk_live_…</Mono></dd>
              <dt className="font-medium text-slate-700">Rate limit</dt>
              <dd>600 requests / minute per key</dd>
              <dt className="font-medium text-slate-700">Bulk size</dt>
              <dd>1000 rows per call, 2 MB JSON</dd>
              <dt className="font-medium text-slate-700">Spec</dt>
              <dd>OpenAPI 3.0 (Developer guide tab)</dd>
            </dl>
          </div>
          <div className="lg:col-span-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Test with curl</p>
            <CodeBlock title="bash" code={pingCurl} />
            <p className="mt-2 text-xs text-slate-500">
              A valid key answers <Mono>{'{ "ok": true, "company": …, "keyName", "scopes", "serverTime" }'}</Mono>. Keep <Mono>serverTime</Mono> as the watermark for <Mono>since=</Mono> pulls.
            </p>
          </div>
        </div>
      </Card>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={changeTab}
        tabs={[
          { key: "keys", label: "API keys" },
          { key: "webhooks", label: "Webhooks" },
          { key: "guide", label: "Developer guide" },
        ]}
      />

      {tab === "guide" ? (
        <DeveloperGuideTab perspective={perspective} />
      ) : notice ? (
        notice
      ) : tab === "keys" ? (
        <ApiKeysTab perspective={perspective} scopeInfo={scopesState.data?.scopes ?? null} />
      ) : (
        <WebhooksTab perspective={perspective} />
      )}
    </div>
  );
}
