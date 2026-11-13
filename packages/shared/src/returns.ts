// Building-materials returns policy, shared by the API (enforcement in POST /orders/:id/returns and
// the refund computation) and the web (return form, supplier returns workspace, /refund-policy page).
// Keep this file dependency-free.

import type { ReturnReason } from "./commerce";

export type ReturnPolicyGroup =
  | "PERISHABLE"
  | "BULK"
  | "STEEL"
  | "MASONRY"
  | "TIMBER"
  | "BOARDS"
  | "TILES_SANITARY"
  | "PAINT"
  | "MEP"
  | "TOOLS"
  | "RENTAL"
  | "SERVICES"
  | "DEFAULT";

export interface ReturnPolicy {
  group: ReturnPolicyGroup;
  /** Short label of the material family. */
  label: { en: string; ar: string };
  /** Change-of-mind returns accepted at all (supplier-fault claims are always accepted within the claim window). */
  returnable: boolean;
  /** Days after delivery during which a change-of-mind return may be requested. */
  windowDays: number;
  /** Restocking fee, % of the goods value, for change-of-mind returns. */
  restockingPct: number;
  /** Buyer pays the return transport for change-of-mind returns (always true today; kept explicit for the table). */
  buyerPaysReturnTransport: boolean;
  conditions: { en: string; ar: string };
  nonReturnableReason?: { en: string; ar: string };
}

/** Hours after delivery during which damage, shortage, wrong-item and defect claims must be raised. */
export const FAULT_CLAIM_HOURS = 48;

/** Reasons that are the supplier's fault: no restocking fee, supplier pays return transport, allowed for non-returnable goods. */
export const FAULT_REASONS: readonly ReturnReason[] = ["DAMAGED", "DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED"] as const;
export const isFaultReason = (reason: string): boolean => (FAULT_REASONS as readonly string[]).includes(reason);

export const DEFAULT_RETURN_POLICY: ReturnPolicy = {
  group: "DEFAULT",
  label: { en: "Other materials and equipment", ar: "مواد ومعدات أخرى" },
  returnable: true,
  windowDays: 7,
  restockingPct: 15,
  buyerPaysReturnTransport: true,
  conditions: {
    en: "Unused, in original undamaged packaging with all accessories and documents; cut-to-size, custom, made-to-order and special-order imports are non-returnable.",
    ar: "غير مستعملة وفي عبوتها الأصلية غير المتضررة مع كامل الملحقات والمستندات؛ ولا تُقبل إعادة المواد المقطوعة حسب المقاس أو المصنّعة حسب الطلب أو المستوردة بطلب خاص.",
  },
};

export const RETURN_POLICIES: Record<ReturnPolicyGroup, ReturnPolicy> = {
  PERISHABLE: {
    group: "PERISHABLE",
    label: { en: "Cement, mortar, grout, adhesives, sealants, chemicals and admixtures", ar: "الأسمنت والمونة والروبة والمواد اللاصقة ومواد العزل والكيماويات والإضافات" },
    returnable: false,
    windowDays: 0,
    restockingPct: 0,
    buyerPaysReturnTransport: true,
    conditions: { en: "Non-returnable once delivered. Wrong item or defective product must be reported within 48 hours of delivery.", ar: "لا تُقبل إعادتها بعد التسليم. ويجب الإبلاغ عن المنتج الخاطئ أو المعيب خلال 48 ساعة من التسليم." },
    nonReturnableReason: { en: "Perishable and moisture-sensitive: shelf life and storage conditions cannot be verified after delivery.", ar: "مواد قابلة للتلف وحساسة للرطوبة، ولا يمكن التحقق من مدة صلاحيتها وظروف تخزينها بعد التسليم." },
  },
  BULK: {
    group: "BULK",
    label: { en: "Aggregates, sand and ready-mix concrete", ar: "الركام والرمل والخرسانة الجاهزة" },
    returnable: false,
    windowDays: 0,
    restockingPct: 0,
    buyerPaysReturnTransport: true,
    conditions: { en: "Non-returnable. Shortage or wrong grade must be noted on the delivery note and reported within 48 hours.", ar: "لا تُقبل إعادتها. ويجب تدوين النقص أو اختلاف الدرجة في إشعار التسليم والإبلاغ عنه خلال 48 ساعة." },
    nonReturnableReason: { en: "Bulk material tipped on site cannot be recovered or re-certified.", ar: "المواد السائبة التي تُفرَّغ في الموقع لا يمكن استعادتها أو إعادة اعتمادها." },
  },
  STEEL: {
    group: "STEEL",
    label: { en: "Steel rebar, mesh and sections", ar: "حديد التسليح والشبك والقطاعات الحديدية" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Uncut, unbent full bundles with intact tags and the original mill certificate; free of rust beyond mill scale.", ar: "حزم كاملة غير مقطوعة وغير مثنية مع بطاقات التعريف سليمة وشهادة المصنع الأصلية، وخالية من الصدأ عدا القشرة الطبيعية." },
  },
  MASONRY: {
    group: "MASONRY",
    label: { en: "Blocks, bricks, pavers and precast", ar: "البلوك والطوب والبلاط المتشابك والخرسانة مسبقة الصب" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Full, undamaged, strapped pallets only; broken pallets and loose units are not accepted. Buyer bears the return transport in addition to the restocking fee.", ar: "منصات (طبالي) كاملة وغير متضررة ومربوطة فقط؛ ولا تُقبل المنصات المفككة أو الوحدات المفردة. ويتحمل المشتري أجور نقل الإرجاع إضافةً إلى رسم إعادة التخزين." },
  },
  TIMBER: {
    group: "TIMBER",
    label: { en: "Timber, plywood and formwork", ar: "الأخشاب والخشب الرقائقي ومواد الشدات" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Unused and dry, in full bundles; no cutting, nailing, oil or concrete contact.", ar: "غير مستعملة وجافة وفي حزم كاملة؛ دون قطع أو تسمير أو تعرض للزيوت أو الخرسانة." },
  },
  BOARDS: {
    group: "BOARDS",
    label: { en: "Gypsum board, ceilings, insulation, waterproofing and roofing", ar: "ألواح الجبس والأسقف والعزل الحراري والمائي ومواد الأسطح" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Undamaged full packs in original wrapping, protected from moisture; opened rolls and partial packs are not accepted.", ar: "عبوات كاملة غير متضررة في تغليفها الأصلي ومحفوظة من الرطوبة؛ ولا تُقبل اللفات المفتوحة أو العبوات الجزئية." },
  },
  TILES_SANITARY: {
    group: "TILES_SANITARY",
    label: { en: "Tiles, flooring and sanitary ware", ar: "البلاط والأرضيات والأدوات الصحية" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Unopened full boxes of the same batch and shade number; sanitary ware in sealed original cartons with fittings.", ar: "صناديق كاملة غير مفتوحة من نفس رقم التشغيلة ودرجة اللون؛ والأدوات الصحية في كراتينها الأصلية المغلقة مع ملحقاتها." },
  },
  PAINT: {
    group: "PAINT",
    label: { en: "Paints and coatings", ar: "الدهانات والطلاءات" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Unopened, sealed containers within shelf life. Tinted or mixed paint and opened containers are non-returnable.", ar: "عبوات مغلقة وغير مفتوحة وضمن مدة الصلاحية. ولا تُقبل إعادة الدهانات الملوّنة حسب الطلب أو المخلوطة أو العبوات المفتوحة." },
  },
  MEP: {
    group: "MEP",
    label: { en: "Pipes, fittings, plumbing, electrical, lighting and HVAC", ar: "المواسير والوصلات والسباكة والكهرباء والإنارة والتكييف" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Unused, in original packaging with labels; cables and wires in full unopened drums or coils only; no cut lengths.", ar: "غير مستعملة وفي عبوتها الأصلية مع البطاقات؛ والكابلات والأسلاك في بكرات أو لفات كاملة غير مفتوحة فقط؛ ولا تُقبل الأطوال المقطوعة." },
  },
  TOOLS: {
    group: "TOOLS",
    label: { en: "Tools, hardware, PPE, workwear and consumables", ar: "العدد والأدوات ومعدات الوقاية الشخصية وملابس العمل والمستهلكات" },
    returnable: true,
    windowDays: 7,
    restockingPct: 15,
    buyerPaysReturnTransport: true,
    conditions: { en: "Unused and sealed in original packaging with all accessories; opened consumables and worn PPE are not accepted.", ar: "غير مستعملة ومغلقة في عبوتها الأصلية مع كامل الملحقات؛ ولا تُقبل المستهلكات المفتوحة أو معدات الوقاية المستعملة." },
  },
  RENTAL: {
    group: "RENTAL",
    label: { en: "Equipment rental", ar: "تأجير المعدات" },
    returnable: false,
    windowDays: 0,
    restockingPct: 0,
    buyerPaysReturnTransport: false,
    conditions: { en: "Governed by the rental contract (hire period, early-return and damage terms). Faults on hand-over must be reported within 48 hours.", ar: "تخضع لعقد التأجير (مدة الإيجار وشروط الإعادة المبكرة والأضرار). ويجب الإبلاغ عن أي خلل عند التسليم خلال 48 ساعة." },
    nonReturnableReason: { en: "Rental is a service; the platform returns flow does not apply.", ar: "التأجير خدمة لا تنطبق عليها آلية الإرجاع في المنصة." },
  },
  SERVICES: {
    group: "SERVICES",
    label: { en: "Services", ar: "الخدمات" },
    returnable: false,
    windowDays: 0,
    restockingPct: 0,
    buyerPaysReturnTransport: false,
    conditions: { en: "Services cannot be returned; quality complaints are handled as claims within 48 hours of completion.", ar: "لا يمكن إعادة الخدمات؛ وتُعالَج الشكاوى المتعلقة بالجودة كمطالبات خلال 48 ساعة من إتمام الخدمة." },
    nonReturnableReason: { en: "Performed services cannot be returned.", ar: "الخدمات المنفذة لا يمكن إعادتها." },
  },
  DEFAULT: DEFAULT_RETURN_POLICY,
};

/** Top-level category slug → policy group. Unlisted slugs use DEFAULT (7 days, 15%). */
export const CATEGORY_RETURN_GROUP: Record<string, ReturnPolicyGroup> = {
  "cement-concrete": "PERISHABLE",
  "chemicals-adhesives": "PERISHABLE",
  "lubricants-chemicals": "PERISHABLE",
  "aggregates-sand": "BULK",
  "steel-rebar": "STEEL",
  "blocks-bricks": "MASONRY",
  "landscaping-precast": "MASONRY",
  "timber-formwork": "TIMBER",
  "gypsum-ceilings": "BOARDS",
  "insulation-waterproofing": "BOARDS",
  "roofing-cladding": "BOARDS",
  "tiles-flooring": "TILES_SANITARY",
  "sanitary-ware": "TILES_SANITARY",
  "paints-coatings": "PAINT",
  plumbing: "MEP",
  "valves-fittings-flanges": "MEP",
  "hoses-seals-gaskets": "MEP",
  electrical: "MEP",
  lighting: "MEP",
  "low-current-networking": "MEP",
  "industrial-electrical-automation": "MEP",
  hvac: "MEP",
  "hvac-spare-parts": "MEP",
  "pumps-motors-drives": "MEP",
  "solar-energy": "MEP",
  "water-treatment-tanks": "MEP",
  "irrigation-landscaping": "MEP",
  "fire-safety": "MEP",
  "fire-life-safety-spares": "MEP",
  "security-cctv": "MEP",
  "smart-building-bms": "MEP",
  "swimming-pool": "MEP",
  "tools-equipment": "TOOLS",
  "hardware-fasteners": "TOOLS",
  "abrasives-consumables": "TOOLS",
  "safety-ppe": "TOOLS",
  "workwear-uniforms": "TOOLS",
  "cleaning-janitorial": "TOOLS",
  "facility-consumables": "TOOLS",
  "office-supplies": "TOOLS",
  "packaging-material-handling": "TOOLS",
  "pest-control-hygiene": "TOOLS",
  "signage-road-safety": "TOOLS",
  "welding-fabrication": "TOOLS",
  "lifting-rigging": "TOOLS",
  "equipment-rental": "RENTAL",
  services: "SERVICES",
};

/** Policy for a material category: the slug itself, then its parent, then the default. */
export function returnPolicyFor(categorySlug?: string | null, parentSlug?: string | null): ReturnPolicy {
  const group = (categorySlug && CATEGORY_RETURN_GROUP[categorySlug]) || (parentSlug && CATEGORY_RETURN_GROUP[parentSlug]) || "DEFAULT";
  return RETURN_POLICIES[group];
}

/** Rows for the policy table on /refund-policy: one per group, in reading order, with the mapped categories. */
export function returnPolicyTable(): Array<ReturnPolicy & { categories: string[] }> {
  const order: ReturnPolicyGroup[] = ["PERISHABLE", "BULK", "STEEL", "MASONRY", "TIMBER", "BOARDS", "TILES_SANITARY", "PAINT", "MEP", "TOOLS", "RENTAL", "SERVICES", "DEFAULT"];
  return order.map((g) => ({ ...RETURN_POLICIES[g], categories: Object.entries(CATEGORY_RETURN_GROUP).filter(([, grp]) => grp === g).map(([slug]) => slug) }));
}

export type ReturnLineVerdictCode = "OK" | "RETURN_NON_RETURNABLE" | "RETURN_CLAIM_WINDOW_CLOSED" | "RETURN_WINDOW_CLOSED";

export interface ReturnLineVerdict {
  ok: boolean;
  code: ReturnLineVerdictCode;
  /** Restocking fee to store on the return line (0 for supplier-fault reasons). */
  restockingPct: number;
  /** Deadline that applied (null when the order is not delivered yet). */
  deadline: Date | null;
}

/**
 * Pure eligibility check for one return line.
 * - Supplier-fault reasons (damaged, defective, wrong item, not as described): accepted for every category, no restocking fee,
 *   within FAULT_CLAIM_HOURS of delivery (or the category window when that is longer). Before delivery (refusal at the door) always allowed.
 * - Change of mind (excess, other): only for returnable categories, within windowDays, with the category restocking fee.
 */
export function evaluateReturnLine(policy: ReturnPolicy, reason: string, deliveredAt: Date | null, now = new Date()): ReturnLineVerdict {
  const fault = isFaultReason(reason);
  if (fault) {
    if (!deliveredAt) return { ok: true, code: "OK", restockingPct: 0, deadline: null };
    const hours = Math.max(FAULT_CLAIM_HOURS, policy.returnable ? policy.windowDays * 24 : 0);
    const deadline = new Date(deliveredAt.getTime() + hours * 3600000);
    return { ok: now <= deadline, code: now <= deadline ? "OK" : "RETURN_CLAIM_WINDOW_CLOSED", restockingPct: 0, deadline };
  }
  if (!policy.returnable) return { ok: false, code: "RETURN_NON_RETURNABLE", restockingPct: 0, deadline: null };
  const since = deliveredAt ?? now;
  const deadline = new Date(since.getTime() + policy.windowDays * 86400000);
  return { ok: now <= deadline, code: now <= deadline ? "OK" : "RETURN_WINDOW_CLOSED", restockingPct: policy.restockingPct, deadline };
}

/** Restocking fee in money for a set of return lines (goods value × pct), rounded to 2 dp. */
export function restockingFeeFor(lines: Array<{ quantity: number; unitPrice: number; restockingPct?: number | null }>): number {
  const fee = lines.reduce((s, l) => s + l.quantity * l.unitPrice * ((l.restockingPct ?? 0) / 100), 0);
  return Math.round(fee * 100) / 100;
}

/** Bilingual messages for the verdict codes (the API sends `code`; the web may use its own dictionary). */
export const RETURN_VERDICT_MESSAGES: Record<Exclude<ReturnLineVerdictCode, "OK">, { en: string; ar: string }> = {
  RETURN_NON_RETURNABLE: { en: "This material is non-returnable once delivered; only damage, defect or wrong-item claims within 48 hours are accepted.", ar: "لا يمكن إعادة هذه المادة بعد التسليم؛ وتُقبل فقط مطالبات التلف أو العيب أو الصنف الخاطئ خلال 48 ساعة." },
  RETURN_CLAIM_WINDOW_CLOSED: { en: "Damage, defect and wrong-item claims must be raised within 48 hours of delivery.", ar: "يجب تقديم مطالبات التلف أو العيب أو الصنف الخاطئ خلال 48 ساعة من التسليم." },
  RETURN_WINDOW_CLOSED: { en: "The return window for this material has closed.", ar: "انتهت مدة الإرجاع المسموح بها لهذه المادة." },
};

/** `GET /orders/:id/return-eligibility`: per-line policy and whether a return would be accepted right now. */
export interface ReturnEligibilityLine {
  orderItemId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** Quantity not yet claimed by open or accepted returns. */
  remaining: number;
  categorySlug: string | null;
  policy: ReturnPolicy;
  changeOfMind: { allowed: boolean; code: ReturnLineVerdictCode; restockingPct: number; deadline: string | null };
  fault: { allowed: boolean; code: ReturnLineVerdictCode; deadline: string | null };
}

export interface ReturnEligibility {
  orderId: string;
  status: string;
  deliveredAt: string | null;
  lines: ReturnEligibilityLine[];
}
