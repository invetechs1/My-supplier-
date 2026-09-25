import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Product } from "@mysupplier/shared";
import { formatSar } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAddToCart, dealPercent, isPurchasable } from "@/hooks/useAddToCart";
import { compareAtOf, effectivePriceOf, saleLive, tiersOf } from "@/lib/pricing";
import { colors, radius, spacing, typography, shadow } from "@/theme";
import { ProductImage } from "./ProductImage";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  /** Fixed width for horizontal rails; omit for grid cells (flex: 1). */
  width?: number;
  style?: ViewStyle;
}

export function StockPill({ product, small = false }: { product: Product; small?: boolean }) {
  const { t } = useI18n();
  const offer = product.bestOffer;
  let label = t("inStock");
  let bg: string = colors.successLight;
  let fg: string = colors.success;
  if (!offer) {
    label = t("onRequest");
    bg = colors.neutralLight;
    fg = colors.textSecondary;
  } else if (product.inStock === false || offer.stock === 0) {
    label = t("outOfStock");
    bg = colors.dangerLight;
    fg = colors.danger;
  } else if (offer.stock === null) {
    label = t("onRequest");
    bg = colors.neutralLight;
    fg = colors.textSecondary;
  }
  return (
    <View style={[styles.pill, { backgroundColor: bg }, small && styles.pillSmall]}>
      <Text style={[styles.pillText, { color: fg }, small && { fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

export function DealBadge({ product }: { product: Product }) {
  const { t } = useI18n();
  if (!product.isDeal) return null;
  const pct = dealPercent(product.avgPrice, effectivePriceOf(product.bestOffer));
  return (
    <View style={styles.deal}>
      <Ionicons name="flash" size={11} color={colors.text} />
      <Text style={styles.dealText}>{pct > 0 ? `-${pct}% ${t("deal")}` : t("deal")}</Text>
    </View>
  );
}

export function ProductCard({ product, onPress, width, style }: ProductCardProps) {
  const { t } = useI18n();
  const { add, adding } = useAddToCart();
  const offer = product.bestOffer ?? null;
  const sellers = product.offerCount ?? product.supplierCount ?? 0;
  const canBuy = Boolean(offer) && isPurchasable(offer) && product.inStock !== false && offer?.stock !== 0;
  const busy = adding === offer?.listingId;
  const price = effectivePriceOf(offer) ?? product.minPrice;
  const compareAt = compareAtOf(offer);
  const onSale = saleLive(offer);
  const hasTiers = tiersOf(offer).length > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, width ? { width } : styles.flexCell, pressed && { opacity: 0.92 }, style]}
      accessibilityRole="button"
      accessibilityLabel={product.name}
    >
      <View>
        <ProductImage material={product} fill rounded={radius.md} />
        <View style={styles.badges}>
          {onSale ? (
            <View style={styles.sale}>
              <Text style={styles.saleText}>{t("sale")}</Text>
            </View>
          ) : null}
          <DealBadge product={product} />
        </View>
      </View>

      <View style={styles.body}>
        {product.brand ? (
          <Text style={styles.brand} numberOfLines={1}>
            {product.brand}
          </Text>
        ) : null}
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.nameAr} numberOfLines={1}>
          {product.nameAr}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.from}>{t("from")} </Text>
          <Text style={[styles.price, onSale && { color: colors.danger }]} numberOfLines={1}>
            {formatSar(price)}
          </Text>
          <Text style={styles.unit}>/{product.unit}</Text>
          {compareAt && price && compareAt > price ? <Text style={styles.compareAt}>{formatSar(compareAt)}</Text> : null}
        </View>
        {hasTiers && !onSale ? (
          <Text style={styles.tierHint} numberOfLines={1}>
            {t("volumePricing")}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {sellers} {sellers === 1 ? t("seller") : t("sellers")}
          </Text>
          {offer?.verified ? <Ionicons name="checkmark-circle" size={13} color={colors.primary} /> : null}
        </View>

        <View style={styles.footer}>
          <StockPill product={product} small />
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              if (offer) void add(offer, product);
            }}
            disabled={!canBuy || busy}
            hitSlop={6}
            accessibilityLabel={t("addToCart")}
            style={({ pressed }) => [styles.addBtn, !canBuy && styles.addBtnDisabled, pressed && { opacity: 0.8 }]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cart-outline" size={14} color="#fff" />
                <Text style={styles.addText}>{t("add")}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    ...shadow.card,
  },
  flexCell: { flex: 1 },
  badges: { position: "absolute", top: 6, left: 6, flexDirection: "row", gap: 4 },
  deal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  dealText: { fontSize: 10, fontWeight: "800", color: colors.text },
  sale: { backgroundColor: colors.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  saleText: { fontSize: 10, fontWeight: "800", color: "#fff", textTransform: "uppercase" },
  compareAt: { ...typography.caption, textDecorationLine: "line-through", marginLeft: 4 },
  tierHint: { ...typography.caption, color: colors.primary, fontWeight: "600", marginTop: 1 },
  body: { paddingTop: spacing.sm, paddingHorizontal: 2 },
  brand: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "600" },
  name: { fontSize: 14, fontWeight: "600", color: colors.text, minHeight: 36, lineHeight: 18 },
  nameAr: { ...typography.caption, marginTop: 1, writingDirection: "rtl", textAlign: "left" },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: spacing.xs, flexWrap: "wrap" },
  from: { ...typography.caption },
  price: { fontSize: 15, fontWeight: "800", color: colors.primary },
  unit: { ...typography.caption, marginLeft: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  meta: { ...typography.caption, flexShrink: 1 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, gap: spacing.xs },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillSmall: { paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: "600" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    height: 30,
    minWidth: 58,
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  addBtnDisabled: { backgroundColor: colors.textMuted, opacity: 0.6 },
  addText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
