import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { CategoryAttribute, Product } from "@mysupplier/shared";
import {
  Screen,
  Button,
  Card,
  SectionHeader,
  Sparkline,
  LoadingView,
  ErrorView,
  KeyValue,
  ProductCard,
  QtyStepper,
  CartButton,
  StockPill,
  DealBadge,
  StatusBadge,
  Stars,
} from "@/components";
import { ImageCarousel } from "@/components/product/ImageCarousel";
import { TierTable } from "@/components/product/TierTable";
import { WishlistSheet } from "@/components/product/WishlistSheet";
import { PriceAlertSheet } from "@/components/product/PriceAlertSheet";
import { ReviewsSection } from "@/components/product/ReviewsSection";
import { QuestionsSection } from "@/components/product/QuestionsSection";
import { api, getErrorMessage, type ProductPage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { compareAtOf, effectivePriceOf, percentOff, saleLive, tiersOf, unitPriceFor, type PricedOffer } from "@/lib/pricing";
import { useApi } from "@/hooks/useApi";
import { useAddToCart, dealPercent, isPurchasable } from "@/hooks/useAddToCart";
import { colors, radius, spacing, typography } from "@/theme";

function stockLabel(offer: PricedOffer, unit: string, t: (k: TranslationKey) => string): { text: string; color: string } {
  if (offer.stock === null) return { text: t("onRequest"), color: colors.textSecondary };
  if (offer.stock <= 0) return { text: t("outOfStock"), color: colors.danger };
  return { text: `${t("inStock")} · ${offer.stock.toLocaleString()} ${unit}`, color: colors.success };
}

function SaleBadge() {
  const { t } = useI18n();
  return (
    <View style={styles.saleBadge}>
      <Ionicons name="pricetag" size={11} color="#fff" />
      <Text style={styles.saleBadgeText}>{t("sale")}</Text>
    </View>
  );
}

/** Spec table driven by the category's attribute definitions, then any extra free-form specs. */
function SpecTable({ product, attributes }: { product: ProductPage; attributes: CategoryAttribute[] }) {
  const { t, locale } = useI18n();
  const specs = product.specs ?? {};
  const rows: Array<{ key: string; label: string; value: string }> = [];
  const used = new Set<string>();
  [...attributes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((a) => {
      const raw = specs[a.key];
      if (raw === undefined || raw === null || raw === "") return;
      used.add(a.key);
      let value = String(raw);
      if (a.type === "BOOLEAN") value = /^(true|yes|1)$/i.test(value) ? t("yes") : /^(false|no|0)$/i.test(value) ? t("no") : value;
      if (a.unit && a.type === "NUMBER") value = `${value} ${a.unit}`;
      rows.push({ key: a.key, label: locale === "ar" && a.labelAr ? a.labelAr : a.label, value });
    });
  Object.entries(specs).forEach(([k, v]) => {
    if (used.has(k) || v === null || v === undefined || v === "") return;
    rows.push({ key: k, label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), value: String(v) });
  });
  if (!rows.length && !product.description) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={t("specifications")} style={{ marginTop: spacing.md }} />
      <Card>
        {product.description ? <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>{product.description}</Text> : null}
        {rows.map((r, i) => (
          <View key={r.key} style={[styles.specRow, i % 2 === 1 && styles.specRowAlt]}>
            <Text style={styles.specLabel}>{r.label}</Text>
            <Text style={styles.specValue}>{r.value}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { isSupplier, isAuthenticated } = useAuth();
  const { showToast } = useCart();
  const { add, adding } = useAddToCart();
  const { data, loading, error, refreshing, reload, refresh } = useApi(() => api.shopProduct(id), [id], Boolean(id));
  const recent = useApi(() => api.recentlyViewed(), [id], isAuthenticated);

  // Wishlist membership for the heart (GET /wishlists/contains).
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [heartBusy, setHeartBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertSet, setAlertSet] = useState(false);
  useEffect(() => {
    setWishlistIds([]);
    setAlertSet(false);
    if (!isAuthenticated || !id) return;
    let cancelled = false;
    api
      .wishlistContains(id)
      .then((res) => {
        if (!cancelled) setWishlistIds(res.wishlistIds);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, isAuthenticated]);

  // Buy box = the API's best offer, falling back to the cheapest purchasable one.
  const buyBox = useMemo<PricedOffer | null>(() => {
    if (!data) return null;
    if (data.bestOffer && isPurchasable(data.bestOffer)) return data.bestOffer;
    return data.offers.find((o) => isPurchasable(o)) ?? null;
  }, [data]);

  const [qty, setQty] = useState(1);
  useEffect(() => {
    setQty(Math.max(1, buyBox?.minQty || 1));
  }, [buyBox?.listingId, buyBox?.minQty]);

  const requireLogin = useCallback(() => router.push({ pathname: "/(auth)/login", params: { redirect: `/shop/product/${id}` } }), [router, id]);

  const toggleHeart = async () => {
    if (!isAuthenticated) return requireLogin();
    if (wishlistIds.length) return setSaveOpen(true);
    setHeartBusy(true);
    try {
      const item = await api.addWishlistItem("default", { materialId: id, quantity: qty, listingId: buyBox?.listingId ?? undefined });
      setWishlistIds([item.wishlistId]);
      showToast(t("savedToList"));
    } catch (err) {
      showToast(getErrorMessage(err));
    } finally {
      setHeartBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen>
        <ErrorView message={error ?? "Product not found"} onRetry={reload} />
      </Screen>
    );
  }

  const product = data;
  const unit = product.unit;
  const saved = wishlistIds.length > 0;
  const unitPrice = unitPriceFor(buyBox, qty);
  const compareAt = compareAtOf(buyBox);
  const sale = saleLive(buyBox);
  const listSavings = buyBox ? Math.max(0, (buyBox.price - unitPrice) * qty) : 0;
  const pctVsAvg = dealPercent(product.avgPrice ?? product.summary.avg, effectivePriceOf(buyBox));
  const buyBoxOut = buyBox ? buyBox.stock !== null && buyBox.stock <= 0 : true;
  const buyBoxMax = buyBox?.stock ?? null;
  const productForPill: Product = { ...product, bestOffer: buyBox };
  const recentItems = (recent.data ?? []).filter((p) => p.id !== product.id);
  const bestPrice = effectivePriceOf(buyBox) ?? product.summary.min ?? product.minPrice ?? null;

  const addToCart = async () => {
    if (!buyBox) return false;
    return add(buyBox, product, qty);
  };
  const buyNow = async () => {
    const ok = await addToCart();
    if (ok) router.push("/cart");
  };

  return (
    <Screen scroll padded={false} refreshing={refreshing} onRefresh={refresh} edges={["left", "right"]}>
      <Stack.Screen options={{ title: product.name, headerRight: () => <CartButton /> }} />

      <ImageCarousel
        material={product}
        images={product.images}
        overlay={
          <>
            {sale ? <SaleBadge /> : null}
            <DealBadge product={{ ...product, bestOffer: buyBox }} />
          </>
        }
      />

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            {product.brand ? (
              <Pressable onPress={() => router.push({ pathname: "/shop/search", params: { brand: product.brand ?? "" } })} hitSlop={4}>
                <Text style={styles.brand}>{product.brand}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.name}>{product.name}</Text>
            <Text style={styles.nameAr}>{product.nameAr}</Text>
          </View>
          <View style={styles.iconActions}>
            <Pressable onPress={() => void toggleHeart()} style={[styles.iconBtn, saved && styles.iconBtnActive]} accessibilityLabel={t("saveToList")} disabled={heartBusy}>
              {heartBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={saved ? "heart" : "heart-outline"} size={22} color={saved ? colors.danger : colors.primary} />}
            </Pressable>
            <Pressable onPress={() => (isAuthenticated ? setAlertOpen(true) : requireLogin())} style={[styles.iconBtn, alertSet && styles.iconBtnActive]} accessibilityLabel={t("priceAlert")}>
              <Ionicons name={alertSet ? "notifications" : "notifications-outline"} size={22} color={colors.primary} />
            </Pressable>
          </View>
        </View>
        <View style={styles.metaRow}>
          {product.reviewSummary?.count ? (
            <>
              <Stars value={product.reviewSummary.average} size={13} showValue count={product.reviewSummary.count} />
              <Text style={styles.dot}>·</Text>
            </>
          ) : null}
          <Text style={styles.meta}>SKU {product.sku}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>per {unit}</Text>
          {product.category?.name ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Pressable onPress={() => router.push({ pathname: "/shop/search", params: { categoryId: product.categoryId } })} hitSlop={4}>
                <Text style={[styles.meta, { color: colors.primary }]}>{product.category.name}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {/* Buy box */}
      <View style={styles.section}>
        <Card style={styles.buyBox}>
          {buyBox ? (
            <>
              <View style={styles.priceRow}>
                <Text style={[styles.price, sale && { color: colors.danger }]}>{formatSar(unitPrice)}</Text>
                <Text style={styles.priceUnit}>/ {unit}</Text>
                {compareAt && compareAt > unitPrice ? <Text style={styles.compareAt}>{formatSar(compareAt)}</Text> : null}
                {compareAt && compareAt > unitPrice ? <Text style={styles.savePct}>-{percentOff(compareAt, unitPrice)}%</Text> : pctVsAvg > 0 ? <Text style={styles.savePct}>-{pctVsAvg}% vs avg</Text> : null}
              </View>
              {sale && buyBox.saleEndsAt ? (
                <Text style={[typography.caption, { color: colors.danger, fontWeight: "600" }]}>
                  {t("saleEnds")} {formatDate(buyBox.saleEndsAt)}
                </Text>
              ) : null}
              {product.summary.avg ? (
                <Text style={typography.caption}>
                  {t("average")} {formatSar(product.summary.avg)} · {product.summary.count} {product.summary.count === 1 ? t("seller") : t("sellers")}
                </Text>
              ) : null}
              <Text style={[typography.caption, { marginTop: 2 }]}>{t("priceIncludesVat")}</Text>

              <View style={styles.sellerBlock}>
                <View style={styles.sellerRow}>
                  <Ionicons name="storefront-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.sellerName} numberOfLines={1}>
                    {buyBox.companyName}
                  </Text>
                  {buyBox.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} /> : null}
                  {buyBox.rating > 0 ? (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={12} color={colors.accent} />
                      <Text style={styles.ratingText}>{buyBox.rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.sellerMeta}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={typography.caption}>{buyBox.city}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                  <Text style={typography.caption}>
                    {t("leadTime")} {buyBox.leadTimeDays}d
                  </Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={typography.caption}>
                    {t("minQty")} {buyBox.minQty} {unit}
                  </Text>
                </View>
                <Text style={[styles.stock, { color: stockLabel(buyBox, unit, t).color }]}>{stockLabel(buyBox, unit, t).text}</Text>
              </View>

              <TierTable offer={buyBox} quantity={qty} unit={unit} />

              <View style={styles.qtyRow}>
                <Text style={styles.qtyLabel}>{t("quantity")}</Text>
                <QtyStepper value={qty} onChange={setQty} min={Math.max(1, buyBox.minQty || 1)} max={buyBoxMax} disabled={buyBoxOut} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.lineTotal}>{formatSar(unitPrice * qty)}</Text>
                  {listSavings > 0.005 ? (
                    <Text style={styles.lineSavings}>
                      {t("youSave")} {formatSar(listSavings)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <Button
                title={t("addToCart")}
                icon="cart-outline"
                size="lg"
                fullWidth
                disabled={buyBoxOut}
                loading={adding === buyBox.listingId}
                onPress={() => void addToCart()}
              />
              <Button
                title={t("buyNow")}
                variant="accent"
                size="lg"
                fullWidth
                disabled={buyBoxOut}
                onPress={() => void buyNow()}
                style={{ marginTop: spacing.sm }}
              />
              {buyBoxOut ? (
                <Button title={t("notifyBackInStock")} variant="ghost" icon="notifications-outline" onPress={() => (isAuthenticated ? setAlertOpen(true) : requireLogin())} style={{ marginTop: spacing.sm }} />
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.price}>{formatSar(product.summary.min ?? product.minPrice)}</Text>
              <Text style={typography.bodySmall}>
                {product.offers.length ? "Only reference prices are available for this product right now." : "No offers yet for this product."}
              </Text>
              <StockPill product={productForPill} />
              <Button
                title={t("notifyBackInStock")}
                variant="secondary"
                icon="notifications-outline"
                fullWidth
                style={{ marginTop: spacing.md }}
                onPress={() => (isAuthenticated ? setAlertOpen(true) : requireLogin())}
              />
              {!isSupplier ? (
                <Button
                  title={t("requestQuotes")}
                  icon="document-text-outline"
                  size="lg"
                  fullWidth
                  style={{ marginTop: spacing.sm }}
                  onPress={() => router.push({ pathname: "/rfq/new", params: { materialId: product.id } })}
                />
              ) : null}
            </>
          )}
          <View style={styles.secondaryActions}>
            <Pressable onPress={() => (isAuthenticated ? setSaveOpen(true) : requireLogin())} style={styles.secondaryBtn} hitSlop={4}>
              <Ionicons name={saved ? "heart" : "heart-outline"} size={16} color={saved ? colors.danger : colors.primary} />
              <Text style={styles.secondaryText}>{saved ? t("saved") : t("saveToList")}</Text>
            </Pressable>
            <Pressable onPress={() => (isAuthenticated ? setAlertOpen(true) : requireLogin())} style={styles.secondaryBtn} hitSlop={4}>
              <Ionicons name="notifications-outline" size={16} color={colors.primary} />
              <Text style={styles.secondaryText}>{t("priceAlert")}</Text>
            </Pressable>
          </View>
        </Card>
      </View>

      {/* All offers */}
      {product.offers.length > 1 || (product.offers.length === 1 && !buyBox) ? (
        <View style={styles.section}>
          <SectionHeader title={`${t("allOffers")} (${product.offers.length})`} style={{ marginTop: spacing.md }} />
          <Card style={{ paddingVertical: spacing.xs }}>
            {product.offers.map((o, i) => {
              const purchasable = isPurchasable(o);
              const out = o.stock !== null && o.stock <= 0;
              const busy = adding === o.listingId;
              const eff = effectivePriceOf(o) ?? o.price;
              const cmp = compareAtOf(o);
              const tiers = tiersOf(o);
              const isBest = buyBox?.listingId === o.listingId;
              return (
                <View key={o.listingId} style={[styles.offerRow, i > 0 && styles.offerRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.sellerRow}>
                      <Text style={styles.offerSeller} numberOfLines={1}>
                        {o.companyName}
                      </Text>
                      {o.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.primary} /> : null}
                      {isBest ? <StatusBadge status="AWARDED" small /> : null}
                      {o.source === "QUOTATION" ? <StatusBadge status="QUOTATION" small /> : null}
                    </View>
                    <View style={styles.sellerMeta}>
                      <Text style={typography.caption}>{o.city}</Text>
                      <Text style={styles.dot}>·</Text>
                      <Text style={typography.caption}>{o.leadTimeDays}d</Text>
                      <Text style={styles.dot}>·</Text>
                      <Text style={typography.caption}>min {o.minQty}</Text>
                      {purchasable ? (
                        <>
                          <Text style={styles.dot}>·</Text>
                          <Text style={[typography.caption, { color: stockLabel(o, unit, t).color }]}>
                            {o.stock === null ? t("onRequest") : out ? t("outOfStock") : t("inStock")}
                          </Text>
                        </>
                      ) : null}
                    </View>
                    {saleLive(o) ? (
                      <View style={styles.hintPill}>
                        <Ionicons name="pricetag-outline" size={12} color={colors.danger} />
                        <Text style={[styles.hintText, { color: colors.danger }]}>
                          {t("sale")}
                          {o.saleEndsAt ? ` · ${t("saleEnds")} ${formatDate(o.saleEndsAt)}` : ""}
                        </Text>
                      </View>
                    ) : null}
                    {tiers.length ? (
                      <View style={styles.hintPill}>
                        <Ionicons name="layers-outline" size={12} color={colors.primary} />
                        <Text style={styles.hintText}>
                          {t("tiersFrom")} {formatSar(tiers[tiers.length - 1].price)} (≥{tiers[tiers.length - 1].minQty} {unit})
                        </Text>
                      </View>
                    ) : null}
                    {!purchasable ? (
                      <View style={styles.hintPill}>
                        <Ionicons name="information-circle-outline" size={12} color={colors.info} />
                        <Text style={[styles.hintText, { color: colors.info }]}>
                          {t("referencePrice")}
                          {o.sourceName ? ` · ${o.sourceName}` : ""}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.offerPrice, saleLive(o) && { color: colors.danger }]}>{formatSar(eff)}</Text>
                      {cmp && cmp > eff ? <Text style={styles.offerCompare}>{formatSar(cmp)}</Text> : null}
                    </View>
                    <Button
                      title={t("add")}
                      size="sm"
                      variant={purchasable ? "secondary" : "ghost"}
                      disabled={!purchasable || out}
                      loading={busy}
                      onPress={() => void add(o, product)}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {product.frequentlyBoughtTogether?.length ? (
        <>
          <SectionHeader title={t("frequentlyBoughtTogether")} style={{ ...styles.section, marginTop: spacing.md }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {product.frequentlyBoughtTogether.map((p) => (
              <ProductCard key={p.id} product={p} width={160} onPress={() => router.push(`/shop/product/${p.id}`)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <SpecTable product={product} attributes={product.attributes ?? []} />

      <View style={styles.section}>
        <SectionHeader title={t("priceTrend")} style={{ marginTop: spacing.md }} />
        <Card>
          <Sparkline history={product.history} />
        </Card>
      </View>

      <View style={styles.section}>
        <ReviewsSection materialId={product.id} summary={product.reviewSummary ?? { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }} />
        <QuestionsSection materialId={product.id} questionsCount={product.questionsCount ?? 0} />
      </View>

      {product.related.length ? (
        <>
          <SectionHeader title={t("relatedProducts")} style={{ ...styles.section, marginTop: spacing.md }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {product.related.map((p) => (
              <ProductCard key={p.id} product={p} width={160} onPress={() => router.push(`/shop/product/${p.id}`)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {recentItems.length ? (
        <>
          <SectionHeader title={t("recentlyViewed")} style={{ ...styles.section, marginTop: spacing.md }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {recentItems.map((p) => (
              <ProductCard key={p.id} product={p} width={160} onPress={() => router.push(`/shop/product/${p.id}`)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {!isSupplier ? (
        <Pressable
          onPress={() => router.push({ pathname: "/rfq/new", params: { materialId: product.id } })}
          style={styles.cta}
        >
          <Ionicons name="flash-outline" size={18} color={colors.primary} />
          <Text style={styles.ctaText}>{t("requestQuotesInstead")}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
      <View style={{ height: spacing.xxl }} />

      <WishlistSheet
        visible={saveOpen}
        materialId={product.id}
        quantity={qty}
        listingId={buyBox?.listingId ?? null}
        containedIn={wishlistIds}
        onClose={() => setSaveOpen(false)}
        onChanged={setWishlistIds}
      />
      <PriceAlertSheet
        visible={alertOpen}
        materialId={product.id}
        productName={product.name}
        currentPrice={bestPrice}
        inStock={Boolean(buyBox) && !buyBoxOut}
        onClose={() => setAlertOpen(false)}
        onCreated={() => {
          setAlertSet(true);
          showToast(t("alertCreated"));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginTop: spacing.lg },
  brand: { ...typography.caption, color: colors.primary, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" },
  name: { ...typography.h1, fontSize: 22, marginTop: 2 },
  nameAr: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  iconActions: { flexDirection: "row", gap: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  iconBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  meta: { ...typography.caption },
  dot: { ...typography.caption, marginHorizontal: 5 },
  saleBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.danger, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
  saleBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  buyBox: { borderWidth: 1, borderColor: colors.primaryLight },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  price: { fontSize: 28, fontWeight: "800", color: colors.primary },
  priceUnit: { ...typography.bodySmall },
  compareAt: { ...typography.body, color: colors.textMuted, textDecorationLine: "line-through" },
  savePct: { ...typography.caption, color: "#B07A00", backgroundColor: colors.accentLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, fontWeight: "700" },
  sellerBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sellerName: { ...typography.body, fontWeight: "600", flexShrink: 1 },
  rating: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 4 },
  ratingText: { ...typography.caption, fontWeight: "600", color: colors.textSecondary },
  sellerMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 4, gap: 2 },
  stock: { fontSize: 13, fontWeight: "600", marginTop: 6 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.md },
  qtyLabel: { ...typography.label },
  lineTotal: { fontSize: 16, fontWeight: "700", color: colors.text },
  lineSavings: { ...typography.caption, color: colors.success, fontWeight: "600" },
  secondaryActions: { flexDirection: "row", justifyContent: "center", gap: spacing.xl, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  secondaryBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  secondaryText: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  offerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  offerRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  offerSeller: { ...typography.body, fontWeight: "600", flexShrink: 1 },
  offerPrice: { fontSize: 16, fontWeight: "700", color: colors.text },
  offerCompare: { ...typography.caption, textDecorationLine: "line-through" },
  hintPill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  hintText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  specRow: { flexDirection: "row", gap: spacing.md, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  specRowAlt: { backgroundColor: colors.neutralLight },
  specLabel: { ...typography.bodySmall, flex: 1 },
  specValue: { ...typography.body, fontWeight: "500", flex: 1, textAlign: "right" },
  rail: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
  },
  ctaText: { flex: 1, color: colors.primary, fontWeight: "600", fontSize: 14 },
});
