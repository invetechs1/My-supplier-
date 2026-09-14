import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import type { Order } from "@mysupplier/shared";
import { Screen, StatusBadge, EmptyState, ErrorView, LoadingView, RequireAuth } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { colors, radius, spacing, typography, shadow } from "@/theme";

function OrdersList() {
  const router = useRouter();
  const { t } = useI18n();
  const { isSupplier } = useAuth();
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const fetchPage = useCallback(async (target: number, mode: "reset" | "more" | "refresh") => {
    const id = ++reqId.current;
    if (mode === "reset") setLoading(true);
    if (mode === "more") setLoadingMore(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const res = await api.orders(target);
      if (id !== reqId.current) return;
      setTotal(res.total);
      setPage(res.page);
      setItems((prev) => (mode === "more" ? [...prev, ...res.data] : res.data));
    } catch (err) {
      if (id !== reqId.current) return;
      setError(getErrorMessage(err));
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
  }, [fetchPage]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      fetchPage(1, "refresh");
    }, [fetchPage]),
  );

  const hasMore = items.length < total;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.heading}>{t("orders")}</Text>
        <Text style={typography.caption}>{isSupplier ? "Orders awarded to your company" : "Awarded RFQs become orders"}</Text>
      </View>
      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => fetchPage(1, "refresh")}
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="No orders yet"
              message={isSupplier ? "When a buyer accepts one of your bids, the order shows up here." : "Accept a bid on one of your RFQs to create an order."}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/order/${item.id}`)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.caption}>{item.reference}</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.rfq?.title ?? "Order"}
                  </Text>
                </View>
                <StatusBadge status={item.status} small />
              </View>
              <View style={styles.cardFooter}>
                <View style={styles.metaRow}>
                  <Ionicons name={isSupplier ? "person-outline" : "storefront-outline"} size={13} color={colors.textMuted} />
                  <Text style={typography.caption} numberOfLines={1}>
                    {isSupplier ? item.rfq?.buyer?.company?.name ?? item.rfq?.buyer?.name ?? "Buyer" : item.company?.name ?? "Supplier"}
                  </Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={typography.caption}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.total}>{formatSar(item.total)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

export default function OrdersTab() {
  return (
    <RequireAuth message="Log in to see your orders.">
      <OrdersList />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  heading: { ...typography.h1, fontSize: 22 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { ...typography.h3, marginTop: 2 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  metaRow: { flexDirection: "row", alignItems: "center", flex: 1, gap: 4 },
  dot: { ...typography.caption, marginHorizontal: 2 },
  total: { fontSize: 16, fontWeight: "700", color: colors.primary },
});
