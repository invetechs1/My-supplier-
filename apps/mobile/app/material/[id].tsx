import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { PriceListing } from "@mysupplier/shared";
import {
  Screen,
  Button,
  PriceTile,
  StatusBadge,
  Card,
  SectionHeader,
  Sparkline,
  LoadingView,
  ErrorView,
  KeyValue,
} from "@/components";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatSar, timeAgo } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

export default function MaterialDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { isSupplier } = useAuth();
  const [showAll, setShowAll] = useState(false);

  const { data, loading, error, refreshing, reload, refresh } = useApi(() => api.material(id), [id], Boolean(id));

  const listings = useMemo<PriceListing[]>(() => {
    const list = [...(data?.listings ?? [])].sort((a, b) => a.price - b.price);
    return showAll ? list : list.slice(0, 8);
  }, [data?.listings, showAll]);

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
        <ErrorView message={error ?? "Material not found"} onRetry={reload} />
      </Screen>
    );
  }

  const { summary } = data;
  const specs = data.specs ? Object.entries(data.specs) : [];

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: data.name }} />
      <View style={styles.titleBlock}>
        <Text style={styles.name}>{data.name}</Text>
        <Text style={styles.nameAr}>{data.nameAr}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>SKU {data.sku}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.meta}>per {data.unit}</Text>
          {data.category?.name ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.meta}>{data.category.name}</Text>
            </>
          ) : null}
          {data.brand ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.meta}>{data.brand}</Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.tiles}>
        <PriceTile label={t("lowest")} value={formatSar(summary.min)} tone="primary" />
        <PriceTile label={t("average")} value={formatSar(summary.avg)} />
        <PriceTile label={t("median")} value={formatSar(summary.median)} />
        <PriceTile label={t("highest")} value={formatSar(summary.max)} />
        <PriceTile label={t("suppliers")} value={String(summary.count)} tone="accent" />
      </View>

      {!isSupplier ? (
        <Button
          title={t("requestQuotes")}
          icon="document-text-outline"
          size="lg"
          fullWidth
          style={{ marginTop: spacing.lg }}
          onPress={() => router.push({ pathname: "/rfq/new", params: { materialId: data.id } })}
        />
      ) : null}

      <SectionHeader title="Price trend" />
      <Card>
        <Sparkline history={data.history} />
      </Card>

      <SectionHeader
        title={`Listings (${data.listings.length})`}
        actionTitle={data.listings.length > 8 ? (showAll ? "Show less" : "Show all") : undefined}
        onAction={() => setShowAll((s) => !s)}
      />
      {listings.length === 0 ? (
        <Card>
          <Text style={typography.bodySmall}>No price listings yet for this material.</Text>
        </Card>
      ) : (
        listings.map((l, i) => (
          <Card key={l.id} style={styles.listing}>
            <View style={styles.listingTop}>
              <View style={{ flex: 1 }}>
                <View style={styles.supplierRow}>
                  <Text style={styles.supplier} numberOfLines={1}>
                    {l.company?.name ?? l.sourceName ?? "Market price"}
                  </Text>
                  {l.company?.verified ? (
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                  ) : null}
                </View>
                <View style={styles.listingMeta}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={typography.caption}>{l.city}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={typography.caption}>min {l.minQty} {data.unit}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={typography.caption}>{l.leadTimeDays}d lead</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.price, i === 0 && { color: colors.success }]}>{formatSar(l.price)}</Text>
                {i === 0 ? <Text style={styles.best}>Best price</Text> : null}
              </View>
            </View>
            <View style={styles.listingFooter}>
              <StatusBadge status={l.source} small />
              <Text style={typography.caption}>Updated {timeAgo(l.updatedAt)}</Text>
            </View>
          </Card>
        ))
      )}

      {specs.length || data.description ? (
        <>
          <SectionHeader title="Specifications" />
          <Card>
            {data.description ? <Text style={[typography.bodySmall, { marginBottom: spacing.sm }]}>{data.description}</Text> : null}
            {specs.map(([k, v]) => (
              <KeyValue key={k} label={k} value={String(v)} />
            ))}
          </Card>
        </>
      ) : null}

      {!isSupplier ? (
        <Pressable onPress={() => router.push({ pathname: "/rfq/new", params: { materialId: data.id } })} style={styles.cta}>
          <Ionicons name="flash-outline" size={18} color={colors.primary} />
          <Text style={styles.ctaText}>Get competing bids from {summary.count || "local"} suppliers</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBlock: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  name: { ...typography.h1, fontSize: 24 },
  nameAr: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: spacing.sm },
  meta: { ...typography.caption },
  dot: { ...typography.caption, marginHorizontal: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  listing: { paddingVertical: spacing.md },
  listingTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  supplierRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  supplier: { ...typography.body, fontWeight: "600", flexShrink: 1 },
  listingMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" },
  price: { fontSize: 17, fontWeight: "700", color: colors.text },
  best: { ...typography.caption, color: colors.success, fontWeight: "600" },
  listingFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  ctaText: { flex: 1, color: colors.primary, fontWeight: "600", fontSize: 14 },
});
