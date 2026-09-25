import React, { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { Category, Product } from "@mysupplier/shared";
import { Screen, SectionHeader, LoadingView, ErrorView, ProductCard, CartButton } from "@/components";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography, shadow } from "@/theme";

const RAIL_CARD_WIDTH = 168;

function ProductRail({ products, onOpen }: { products: Product[]; onOpen: (p: Product) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} width={RAIL_CARD_WIDTH} onPress={() => onOpen(p)} />
      ))}
    </ScrollView>
  );
}

function ProductGrid({ products, onOpen }: { products: Product[]; onOpen: (p: Product) => void }) {
  const rows: Product[][] = [];
  for (let i = 0; i < products.length; i += 2) rows.push(products.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row, i) => (
        <View key={row[0]?.id ?? i} style={styles.gridRow}>
          {row.map((p) => (
            <ProductCard key={p.id} product={p} onPress={() => onOpen(p)} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

export default function ShopScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, isAuthenticated, isSupplier } = useAuth();
  const { data, loading, error, refreshing, reload, refresh } = useApi(() => api.shopHome(), []);
  // Personalised rails (logged in only): popular items from recently browsed categories + last viewed.
  const recommended = useApi(() => api.recommendations(), [isAuthenticated], isAuthenticated);
  const recent = useApi(() => api.recentlyViewed(), [isAuthenticated], isAuthenticated);

  const openProduct = useCallback((p: Product) => router.push(`/shop/product/${p.id}`), [router]);
  const onRefresh = useCallback(() => {
    refresh();
    if (isAuthenticated) {
      recommended.refresh();
      recent.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, isAuthenticated]);
  const goSearch = useCallback(
    (params: Record<string, string> = {}) => router.push({ pathname: "/shop/search", params }),
    [router],
  );

  if (loading && !data) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  }

  const home = data;
  const categories: Category[] = home?.categories ?? [];

  return (
    <Screen scroll padded={false} refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{t("shop")}</Text>
            <Text style={styles.heroSub}>
              {user ? `${t("welcome")}, ${user.name.split(" ")[0]}` : "Build for less"}
            </Text>
          </View>
          <CartButton color="#fff" style={styles.heroBtn} />
        </View>
        <Pressable style={styles.searchBar} onPress={() => goSearch()} accessibilityRole="search">
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={styles.searchText}>{t("searchProducts")}</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => goSearch({ sort: "popular" })}
        style={({ pressed }) => [styles.banner, pressed && { opacity: 0.93 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerKicker}>MySupplier · {t("brandTagline")}</Text>
          <Text style={styles.bannerTitle}>{t("shopBannerTitle")}</Text>
          <Text style={styles.bannerSub}>{t("shopBannerSubtitle")}</Text>
          {home?.stats ? (
            <Text style={styles.bannerStats}>
              {home.stats.materials.toLocaleString()} products · {home.stats.suppliers.toLocaleString()} {t("suppliers").toLowerCase()}
            </Text>
          ) : null}
        </View>
        <View style={styles.bannerIcon}>
          <Ionicons name="cart" size={30} color={colors.text} />
        </View>
      </Pressable>

      {isAuthenticated && !isSupplier ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {(
            [
              { icon: "repeat-outline", label: t("buyAgain"), path: "/buy-again" },
              { icon: "heart-outline", label: t("myLists"), path: "/lists" },
              { icon: "calendar-outline", label: t("recurringOrders"), path: "/recurring" },
              { icon: "notifications-outline", label: t("priceAlerts"), path: "/alerts" },
            ] as const
          ).map((q) => (
            <Pressable key={q.path} onPress={() => router.push(q.path)} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}>
              <Ionicons name={q.icon} size={16} color={colors.primary} />
              <Text style={styles.quickText}>{q.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {isAuthenticated && recommended.data?.items.length ? (
        <>
          <SectionHeader title={t("recommendedForYou")} style={styles.sectionPadded} actionTitle={t("seeAll")} onAction={() => goSearch({ sort: "popular" })} />
          <ProductRail products={recommended.data.items} onOpen={openProduct} />
        </>
      ) : null}

      {categories.length ? (
        <>
          <SectionHeader title={t("categories")} style={styles.sectionPadded} actionTitle={t("seeAll")} onAction={() => goSearch()} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRail}>
            {categories.map((c) => (
              <Pressable key={c.id} style={({ pressed }) => [styles.cat, pressed && { opacity: 0.85 }]} onPress={() => goSearch({ categoryId: c.id })}>
                <View style={styles.catIcon}>
                  <Text style={{ fontSize: 22 }}>{c.icon || "📦"}</Text>
                </View>
                <Text style={styles.catLabel} numberOfLines={2}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {home?.deals.length ? (
        <>
          <View style={[styles.sectionPadded, styles.dealsHeader]}>
            <View style={styles.dealsTitleRow}>
              <Ionicons name="flash" size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>{t("deals")}</Text>
            </View>
            <Pressable onPress={() => goSearch({ sort: "price_asc" })} hitSlop={8}>
              <Text style={styles.sectionAction}>{t("seeAll")}</Text>
            </Pressable>
          </View>
          <ProductRail products={home.deals} onOpen={openProduct} />
        </>
      ) : null}

      {home?.featured.length ? (
        <>
          <SectionHeader title={t("featured")} style={styles.sectionPadded} actionTitle={t("seeAll")} onAction={() => goSearch({ sort: "popular" })} />
          <ProductGrid products={home.featured} onOpen={openProduct} />
        </>
      ) : null}

      {home?.newArrivals.length ? (
        <>
          <SectionHeader title={t("newArrivals")} style={styles.sectionPadded} actionTitle={t("seeAll")} onAction={() => goSearch({ sort: "newest" })} />
          <ProductRail products={home.newArrivals} onOpen={openProduct} />
        </>
      ) : null}

      {isAuthenticated && recent.data?.length ? (
        <>
          <SectionHeader title={t("recentlyViewed")} style={styles.sectionPadded} />
          <ProductRail products={recent.data} onOpen={openProduct} />
        </>
      ) : null}

      {!home?.deals.length && !home?.featured.length && !home?.newArrivals.length ? (
        <View style={styles.sectionPadded}>
          <Text style={[typography.bodySmall, { marginTop: spacing.xl }]}>No products yet. Check back soon.</Text>
        </View>
      ) : null}

      <Pressable onPress={() => router.push("/boq")} style={({ pressed }) => [styles.boqCard, pressed && { opacity: 0.92 }]}>
        <Ionicons name="list-outline" size={22} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.boqTitle}>{t("boqTitle")}</Text>
          <Text style={typography.caption}>{t("boqSubtitle")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  heroTitle: { fontSize: 22, fontWeight: "700", color: "#fff" },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  heroBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchText: { ...typography.body, color: colors.textMuted, flex: 1 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  bannerKicker: { fontSize: 11, fontWeight: "700", color: "rgba(17,24,39,0.7)", textTransform: "uppercase", letterSpacing: 0.8 },
  bannerTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 2 },
  bannerSub: { fontSize: 13, color: "rgba(17,24,39,0.8)", marginTop: 2 },
  bannerStats: { fontSize: 12, color: "rgba(17,24,39,0.7)", marginTop: spacing.sm, fontWeight: "600" },
  bannerIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.55)", alignItems: "center", justifyContent: "center" },
  sectionPadded: { paddingHorizontal: spacing.lg },
  quickRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  quick: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow.card },
  quickText: { fontSize: 13, fontWeight: "600", color: colors.text },
  sectionTitle: { ...typography.h2, fontSize: 18 },
  sectionAction: { color: colors.primary, fontWeight: "600", fontSize: 14 },
  dealsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md },
  dealsTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  catRail: { paddingHorizontal: spacing.lg, gap: spacing.md },
  cat: { width: 76, alignItems: "center" },
  catIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  catLabel: { ...typography.caption, color: colors.textSecondary, textAlign: "center", marginTop: 6, fontWeight: "500" },
  rail: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  grid: { paddingHorizontal: spacing.lg, gap: spacing.md },
  gridRow: { flexDirection: "row", gap: spacing.md },
  boqCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
  },
  boqTitle: { ...typography.h3, color: colors.primary },
});
