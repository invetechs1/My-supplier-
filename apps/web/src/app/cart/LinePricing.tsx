"use client";

import { useI18n } from "@/lib/i18n";
import { cn, formatSar } from "@/lib/format";
import { Badge } from "@/components/ui";
import { hasDiscount, type CartLine } from "@/lib/api/commerce";

/** Effective unit price with the base price struck through when a volume tier or a sale applies. */
export function LineUnitPrice({ line, className }: { line: CartLine; className?: string }) {
  const { lang } = useI18n();
  const unit = line.unitPrice ?? line.offer.price;
  const discounted = hasDiscount(line);
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-1.5", className)}>
      <span className={cn("font-semibold tabular-nums", discounted ? "text-emerald-700" : "text-slate-900")}>{formatSar(unit, lang)}</span>
      {discounted && <s className="text-xs tabular-nums text-slate-400">{formatSar(line.basePrice, lang)}</s>}
      <span className="text-xs text-slate-500">/ {line.material.unit}</span>
    </span>
  );
}

/** "Tier: 50+ units" / "Sale" badges for a cart line. */
export function LineBadges({ line }: { line: CartLine }) {
  const { t } = useI18n();
  if (!line.saleApplied && !line.tierApplied) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {line.saleApplied && <Badge tone="red">{t("product.sale")}</Badge>}
      {!line.saleApplied && line.tierApplied && (
        <Badge tone="green">
          {t("cart.tier")}: {line.tierApplied.minQty}+ {line.material.unit}
        </Badge>
      )}
    </span>
  );
}

/** Nudge towards the next volume break: "Add N more to pay SAR x/unit (save SAR y)". */
export function NextTierHint({ line, className }: { line: CartLine; className?: string }) {
  const { t, lang } = useI18n();
  const next = line.nextTier;
  if (!next) return null;
  const more = Math.max(0, Math.ceil(next.minQty - line.quantity));
  if (more <= 0) return null;
  const saveTotal = next.savePerUnit * next.minQty;
  return (
    <p className={cn("text-xs text-brand-700", className)}>
      {t("cart.add")} <span className="font-semibold">{more}</span> {t("cart.moreToPay")} {formatSar(next.price, lang)}/{line.material.unit}{" "}
      <span className="text-slate-500">
        ({t("cart.saveWord")} {formatSar(next.savePerUnit, lang)}/{line.material.unit}, {formatSar(saveTotal, lang)} {t("cart.on")} {next.minQty})
      </span>
    </p>
  );
}

/** Compact one-line variant for order summaries. */
export function LinePricingSummary({ line }: { line: CartLine }) {
  const { t, lang } = useI18n();
  const discounted = hasDiscount(line);
  if (!discounted && !line.nextTier) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
      {line.saleApplied && <Badge tone="red">{t("product.sale")}</Badge>}
      {!line.saleApplied && line.tierApplied && <Badge tone="green">{t("cart.tier")} {line.tierApplied.minQty}+</Badge>}
      {discounted && (
        <span className="text-emerald-700">
          {t("cart.saving")} {formatSar((line.basePrice ?? 0) - (line.unitPrice ?? 0), lang)}/{line.material.unit}
        </span>
      )}
      {!discounted && line.nextTier && (
        <span className="text-brand-700">
          +{Math.max(0, Math.ceil(line.nextTier.minQty - line.quantity))} → {formatSar(line.nextTier.price, lang)}/{line.material.unit}
        </span>
      )}
    </span>
  );
}
