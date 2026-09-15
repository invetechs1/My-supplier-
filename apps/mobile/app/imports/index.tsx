import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import type { PriceImport } from "@mysupplier/shared";
import { Screen, Button, EmptyState, ErrorView, LoadingView, RequireAuth, StatusBadge } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { importKindLabel } from "@/lib/imports";
import { colors, radius, spacing, typography, shadow } from "@/theme";

function kindIcon(kind: PriceImport["kind"]): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case "BUYER_QUOTATION":
      return "receipt-outline";
    case "WEB_PAGE":
      return "globe-outline";
    case "TEXT":
      return "create-outline";
    default:
      return "pricetags-outline";
  }
}

function ImportsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const isBuyer = user?.role === "BUYER";
  const [items, setItems] = useState<PriceImport[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const loadedOnce = useRef(false);

  const fetchPage = useCallback(async (target: number, mode: "reset" | "more" | "refresh" | "silent") => {
    const id = ++reqId.current;
    if (mode === "reset") setLoading(true);
    if (mode === "more") setLoadingMore(true);
    if (mode === "refresh") setRefreshing(true);
    if (mode !== "silent") setError(null);
    try {
      const res = await api.imports({ page: target });
      if (id !== reqId.current) return;
      setTotal(res.total);
      setPage(res.page);
      setItems((prev) => (mode === "more" ? [...prev, ...res.data] : res.data));
    } catch (err) {
      if (id !== reqId.current) return;
      if (mode !== "silent") setError(getErrorMessage(err));
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchPage(1, "reset");
    loadedOnce.current = true;
  }, [fetchPage]);

  // Statuses change on the review screen; refresh quietly when coming back.
  useFocusEffect(
    useCallback(() => {
      if (loadedOnce.current) void fetchPage(1, "silent");
    }, [fetchPage]),
  );

  const hasMore = items.length < total;
  const title = isBuyer ? t("myQuotations") : t("myImports");
  const emptyTitle = isBuyer ? "No quotations uploaded yet" : "No imports yet";
  const emptyMessage = isBuyer
    ? "Upload a quotation you received and every price in it becomes comparable with other suppliers."
    : "Scan a price list or upload a PDF/Excel and we read every line for you.";
  const newLabel = isBuyer ? t("uploadQuotation") : t("scanPriceList");

  return (
    <Screen padded={false} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title }} />
      <View style={styles.header}>
        <Text style={typography.bodySmall}>
          {total} {isBuyer ? (total === 1 ? "quotation" : "quotations") : total === 1 ? "import" : "imports"}
        </Text>
        <Button title="New" icon="add" size="sm" onPress={() => router.push("/imports/new")} />
      </View>
      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => fetchPage(1, "refresh")}
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState icon="scan-outline" title={emptyTitle} message={emptyMessage} actionTitle={newLabel} onAction={() => router.push("/imports/new")} />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
          renderItem={({ item }) => {
            const needsReview = item.status === "REVIEW";
            return (
              <Pressable onPress={() => router.push(`/imports/${item.id}`)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
                <View style={[styles.icon, needsReview && { backgroundColor: colors.warningLight }]}>
                  <Ionicons name={kindIcon(item.kind)} size={20} color={needsReview ? colors.warning : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.sourceName}
                    </Text>
                    <StatusBadge status={item.status} small />
                  </View>
                  <Text style={typography.caption} numberOfLines={1}>
                    {importKindLabel(item.kind)}
                    {item.fileName ? ` · ${item.fileName}` : item.kind === "TEXT" ? " · pasted" : ""}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={typography.caption}>{formatDateTime(item.createdAt)}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={typography.caption}>
                      {item.extractedCount} extracted
                      {item.status === "PUBLISHED" || item.publishedCount ? ` · ${item.publishedCount} published` : ""}
                    </Text>
                    {item.aiUsed ? (
                      <>
                        <Text style={styles.dot}>·</Text>
                        <Ionicons name="sparkles" size={11} color={colors.purple} />
                      </>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

export default function ImportsScreen() {
  return (
    <RequireAuth message="Log in to see your imports.">
      <ImportsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  list: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: "600", flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" },
  dot: { ...typography.caption, marginHorizontal: 5 },
});
