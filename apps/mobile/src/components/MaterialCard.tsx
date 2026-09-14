import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Material } from "@mysupplier/shared";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography, shadow } from "@/theme";

interface MaterialCardProps {
  material: Material;
  onPress?: () => void;
  compact?: boolean;
}

export function MaterialCard({ material, onPress, compact = false }: MaterialCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>
            {material.name}
          </Text>
          <Text style={styles.nameAr} numberOfLines={1}>
            {material.nameAr}
          </Text>
        </View>
        <View style={styles.unitPill}>
          <Text style={styles.unitText}>/{material.unit}</Text>
        </View>
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>Min</Text>
          <Text style={[styles.price, { color: colors.success }]}>{formatSar(material.minPrice)}</Text>
        </View>
        {!compact ? (
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>Avg</Text>
            <Text style={styles.price}>{formatSar(material.avgPrice)}</Text>
          </View>
        ) : null}
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>Max</Text>
          <Text style={[styles.price, { color: colors.textSecondary }]}>{formatSar(material.maxPrice)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.metaRow}>
          <Ionicons name="storefront-outline" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>
            {material.supplierCount ?? 0} supplier{(material.supplierCount ?? 0) === 1 ? "" : "s"}
          </Text>
        </View>
        {material.category?.name ? (
          <Text style={styles.meta} numberOfLines={1}>
            {material.category.name}
          </Text>
        ) : material.brand ? (
          <Text style={styles.meta} numberOfLines={1}>
            {material.brand}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  name: { ...typography.h3 },
  nameAr: { ...typography.bodySmall, marginTop: 2, writingDirection: "rtl", textAlign: "left" },
  unitPill: {
    backgroundColor: colors.neutralLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  unitText: { ...typography.caption, color: colors.textSecondary, fontWeight: "600" },
  priceRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.md },
  priceCol: { flex: 1 },
  priceLabel: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.4 },
  price: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 2 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { ...typography.caption, flexShrink: 1 },
});
