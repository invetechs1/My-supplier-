"use client";

import { FAULT_CLAIM_HOURS, returnPolicyTable } from "@mysupplier/shared";
import { LegalTable } from "./Prose";

const L = {
  en: { material: "Material family", returnable: "Change-of-mind return", window: "Window", fee: "Restocking fee", conditions: "Conditions", no: "Not returnable", yes: "Yes", days: (n: number) => `${n} days from delivery`, claims: `Damage / wrong item: report within ${FAULT_CLAIM_HOURS} h`, na: "—", transport: "+ return transport" },
  ar: { material: "فئة المواد", returnable: "الإرجاع لتغيّر الرغبة", window: "المدة", fee: "رسم إعادة التخزين", conditions: "الشروط", no: "غير قابلة للإرجاع", yes: "نعم", days: (n: number) => `${n} أيام من التسليم`, claims: `التلف / الصنف الخاطئ: الإبلاغ خلال ${FAULT_CLAIM_HOURS} ساعة`, na: "—", transport: "+ أجور نقل الإرجاع" },
};

/** The per-category returns schedule rendered from the shared RETURN_POLICIES (the same table the API enforces). */
export function ReturnsPolicyTable({ lang }: { lang: "en" | "ar" }) {
  const t = L[lang];
  const rows = returnPolicyTable().map((p) => [
    <span key="m" className="font-medium text-slate-900">{p.label[lang]}</span>,
    p.returnable ? <span key="r" className="font-semibold text-emerald-700">{t.yes}</span> : <span key="r" className="font-semibold text-red-700">{t.no}</span>,
    p.returnable ? t.days(p.windowDays) : <span key="w" className="text-xs text-slate-500">{t.claims}</span>,
    p.returnable ? <span key="f" dir="ltr">{p.restockingPct}%{p.group === "MASONRY" ? ` ${t.transport}` : ""}</span> : t.na,
    <span key="c">{p.conditions[lang]}{p.nonReturnableReason ? <span className="block text-xs text-slate-500">{p.nonReturnableReason[lang]}</span> : null}</span>,
  ]);
  return <LegalTable head={[t.material, t.returnable, t.window, t.fee, t.conditions]} rows={rows} className="my-2 text-xs sm:text-sm" />;
}
