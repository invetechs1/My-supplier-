import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { nextTierFor, percentOff, saleLive, tierFor, tiersOf, type PricedOffer } from "@/lib/pricing";
import { colors, radius, spacing, typography } from "@/theme";

interface Props {
  offer: PricedOffer;
  quantity: number;
  unit: string;
}

/** Volume ladder (base price + tiers) with the applied row highlighted and a "buy N more" nudge. */
export function TierTable({ offer, quantity, unit }: Props) {
  const { t } = useI18n();
  const tiers = tiersOf(offer);
  if (!tiers.length) return null;
  const applied = tierFor(offer, quantity);
  const sale = saleLive(offer);
  const next = nextTierFor(offer, quantity);
  const rows = [{ minQty: Math.max(1, offer.minQty || 1), price: offer.price, base: true }, ...tiers.map((tr) => ({ ...tr, base: false }))];

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="layers-outline" size={15} color={colors.primary} />
        <Text style={styles.title}>{t("volumePricing")}</Text>
      </View>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.cell, styles.headerCell]}>{t("quantity")}</Text>
          <Text style={[styles.cell, styles.headerCell, styles.right]}>{t("unitPrice")}</Text>
          <Text style={[styles.cell, styles.headerCell, styles.right]}>{t("youSave")}</Text>
        </View>
        {rows.map((r, i) => {
          const nextMin = rows[i + 1]?.minQty;
          const active = !sale && (applied ? applied.minQty === r.minQty && !r.base : r.base);
          const pct = percentOff(offer.price, r.price);
          return (
            <View key={`${r.minQty}`} style={[styles.row, active && styles.rowActive]}>
              <Text style={[styles.cell, active && styles.cellActive]}>
                {r.minQty}
                {nextMin ? `–${nextMin - 1}` : "+"} {unit}
              </Text>
              <Text style={[styles.cell, styles.right, styles.price, active && styles.cellActive]}>{formatSar(r.price)}</Text>
              <Text style={[styles.cell, styles.right, active && styles.cellActive]}>{pct > 0 ? `-${pct}%` : "—"}</Text>
            </View>
          );
        })}
      </View>
      {sale ? (
        <Text style={styles.note}>
          {t("sale")}: {formatSar(offer.salePrice as number)} {t("perUnit")}
        </Text>
      ) : next ? (
        <View style={styles.nudge}>
          <Ionicons name="trending-down-outline" size={14} color={colors.success} />
          <Text style={styles.nudgeText}>
            {t("buy")} {next.minQty - quantity} {t("moreToPay")} {formatSar(next.price)} ({t("saveAmount")} {formatSar(next.savePerUnit)} {t("perUnit")})
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  title: { ...typography.label, color: colors.primary },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  row: { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  headerRow: { backgroundColor: colors.neutralLight, borderTopWidth: 0 },
  rowActive: { backgroundColor: colors.primaryLight },
  cell: { flex: 1, fontSize: 13, color: colors.textSecondary },
  headerCell: { ...typography.caption, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  cellActive: { color: colors.primary, fontWeight: "700" },
  right: { textAlign: "right" },
  price: { fontWeight: "600", color: colors.text },
  note: { ...typography.caption, marginTop: spacing.xs },
  nudge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  nudgeText: { ...typography.caption, color: colors.success, fontWeight: "600", flex: 1 },
});
