import React, { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { Category, Material, PlatformStats, PriceIndexEntry } from "@mysupplier/shared";
import { Screen, MaterialCard, Card, SectionHeader, Chip, LoadingView, ErrorView } from "@/components";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatPct, formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography, shadow } from "@/theme";

interface HomeData {
  stats: PlatformStats | null;
  index: PriceIndexEntry[];
  categories: Category[];
  recent: Material[];
}

async function loadHome(): Promise<HomeData> {
  const [stats, index, categories, recent] = await Promise.allSettled([
    api.stats(),
    api.priceIndex(),
    api.categories(),
    api.materials({ sort: "updated", pageSize: 10 }),
  ]);
  // If everything failed, surface the first error; otherwise degrade gracefully.
  if ([stats, index, categories, recent].every((r) => r.status === "rejected")) {
    throw (stats as PromiseRejectedResult).reason;
  }
  return {
    stats: stats.status === "fulfilled" ? stats.value : null,
    index: index.status === "fulfilled" ? index.value : [],
    categories: categories.status === "fulfilled" ? categories.value : [],
    recent: recent.status === "fulfilled" ? recent.value.data : [],
  };
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, loading, error, refreshing, reload, refresh } = useApi(loadHome, []);

  const goSearch = useCallback(
    (params?: { categoryId?: string; q?: string }) => {
      router.push({ pathname: "/(tabs)/search", params: params ?? {} });
    },
    [router],
  );

  const statTiles = useMemo(() => {
    const s = data?.stats;
    if (!s) return [];
    return [
      { label: "Materials", value: compact(s.materials), icon: "cube-outline" as const },
      { label: t("suppliers"), value: compact(s.suppliers), icon: "storefront-outline" as const },
      { label: "Prices", value: compact(s.priceListings), icon: "pricetags-outline" as const },
      { label: "Open RFQs", value: compact(s.openRfqs), icon: "document-text-outline" as const },
    ];
  }, [data?.stats, t]);

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

  const greeting = user ? `${t("welcome")}, ${user.name.split(" ")[0]}` : t("welcome");

  return (
    <Screen scroll padded={false} refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.heroSub}>Find today&apos;s best building-material prices</Text>
          </View>
          <Pressable
            onPress={() => router.push(user ? "/notifications" : "/(auth)/login")}
            style={styles.bell}
            hitSlop={8}
          >
            <Ionicons name={user ? "notifications-outline" : "log-in-outline"} size={22} color="#fff" />
          </Pressable>
        </View>
        <Pressable style={styles.searchBar} onPress={() => goSearch()}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={styles.searchText}>{t("searchPlaceholder")}</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push("/boq")} style={({ pressed }) => [styles.boqCard, pressed && { opacity: 0.92 }]}>
        <View style={styles.boqIcon}>
          <Ionicons name="list-outline" size={24} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.boqTitle}>{t("boqTitle")}</Text>
          <Text style={styles.boqSub}>{t("boqSubtitle")}</Text>
        </View>
        <Ionicons name="arrow-forward-circle" size={28} color={colors.accent} />
      </Pressable>

      {user ? (
        <Pressable onPress={() => router.push("/imports/new")} style={({ pressed }) => [styles.importCard, pressed && { opacity: 0.92 }]}>
          <View style={styles.importIcon}>
            <Ionicons name={user.role === "SUPPLIER" ? "scan-outline" : "receipt-outline"} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.importTitle}>
              {user.role === "SUPPLIER" ? "Update prices from a photo or PDF" : "Got a quotation? Upload it"}
            </Text>
            <Text style={styles.importSub}>
              {user.role === "SUPPLIER"
                ? "Scan your price list and we match every line to the catalogue"
                : "Upload it and get every supplier\u2019s price for the same items"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      ) : null}

      {statTiles.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsStrip}>
          {statTiles.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Ionicons name={s.icon} size={18} color={colors.primary} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
          {data?.stats ? (
            <View style={[styles.stat, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="trending-up-outline" size={18} color="#B07A00" />
              <Text style={styles.statValue}>{formatSar(data.stats.gmv)}</Text>
              <Text style={styles.statLabel}>Order value</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title={t("priceIndex")} style={{ marginTop: spacing.md }} />
        {data?.index.length ? (
          <Card style={{ paddingVertical: spacing.xs }}>
            {data.index.map((entry, i) => {
              const up = entry.changePct30d > 0;
              const flat = entry.changePct30d === 0;
              const color = flat ? colors.textMuted : up ? colors.danger : colors.success;
              return (
                <Pressable
                  key={entry.category.id}
                  style={[styles.indexRow, i > 0 && styles.indexRowBorder]}
                  onPress={() => goSearch({ categoryId: entry.category.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.indexName}>{entry.category.name}</Text>
                    <Text style={typography.caption}>{entry.materialCount} materials</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.indexPrice}>{formatSar(entry.avgPrice)}</Text>
                    <View style={styles.changeRow}>
                      <Ionicons
                        name={flat ? "remove" : up ? "arrow-up" : "arrow-down"}
                        size={12}
                        color={color}
                      />
                      <Text style={[styles.change, { color }]}>{formatPct(entry.changePct30d)} 30d</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <Text style={typography.bodySmall}>Price index unavailable.</Text>
        )}
      </View>

      {data?.categories.length ? (
        <View>
          <SectionHeader title={t("categories")} style={styles.sectionPadded} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {data.categories.map((c) => (
              <Chip
                key={c.id}
                label={`${c.name}${c.materialCount != null ? ` (${c.materialCount})` : ""}`}
                onPress={() => goSearch({ categoryId: c.id })}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title={t("recentlyUpdated")} actionTitle="See all" onAction={() => goSearch()} />
        {data?.recent.length ? (
          data.recent.map((m) => (
            <MaterialCard key={m.id} material={m} onPress={() => router.push(`/material/${m.id}`)} />
          ))
        ) : (
          <Text style={typography.bodySmall}>No materials yet.</Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  greeting: { fontSize: 22, fontWeight: "700", color: "#fff" },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  boqCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.text,
  },
  boqIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  boqTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  boqSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  importCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    ...shadow.card,
  },
  importIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  importTitle: { ...typography.body, fontWeight: "700" },
  importSub: { ...typography.caption, marginTop: 2 },
  statsStrip: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  stat: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minWidth: 110,
    ...shadow.card,
  },
  statValue: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 6 },
  statLabel: { ...typography.caption },
  section: { paddingHorizontal: spacing.lg },
  sectionPadded: { paddingHorizontal: spacing.lg },
  chips: { paddingHorizontal: spacing.lg },
  indexRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  indexRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  indexName: { ...typography.body, fontWeight: "600" },
  indexPrice: { fontSize: 14, fontWeight: "700", color: colors.text },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  change: { fontSize: 12, fontWeight: "600" },
});
