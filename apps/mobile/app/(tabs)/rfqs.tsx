import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import type { Rfq, RfqStatus } from "@mysupplier/shared";
import { Screen, StatusBadge, Chip, EmptyState, ErrorView, LoadingView, RequireAuth, Button } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { daysUntil, formatSar, timeAgo } from "@/lib/format";
import { colors, radius, spacing, typography, shadow } from "@/theme";

type MarketRfq = Rfq & { myBidId?: string | null };

const STATUS_FILTERS: Array<{ value: "" | RfqStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "AWARDED", label: "Awarded" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function RfqRow({ rfq, supplierView, onPress }: { rfq: MarketRfq; supplierView: boolean; onPress: () => void }) {
  const left = daysUntil(rfq.closesAt);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={typography.caption}>{rfq.reference}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {rfq.title}
          </Text>
        </View>
        <StatusBadge status={rfq.status} small />
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={13} color={colors.textMuted} />
        <Text style={typography.caption}>{rfq.deliveryCity}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={typography.caption}>
          {rfq.items.length} item{rfq.items.length === 1 ? "" : "s"}
        </Text>
        <Text style={styles.dot}>·</Text>
        <Text style={typography.caption}>{timeAgo(rfq.createdAt)}</Text>
      </View>
      <View style={styles.cardFooter}>
        {supplierView ? (
          rfq.myBidId ? (
            <View style={styles.bidFlag}>
              <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
              <Text style={styles.bidFlagText}>You have bid</Text>
            </View>
          ) : (
            <Text style={[typography.caption, { color: colors.accent, fontWeight: "600" }]}>
              {rfq.bidCount ?? 0} bid{(rfq.bidCount ?? 0) === 1 ? "" : "s"} so far
            </Text>
          )
        ) : (
          <Text style={typography.caption}>
            {rfq.bidCount ?? 0} bid{(rfq.bidCount ?? 0) === 1 ? "" : "s"}
            {rfq.lowestBid != null ? ` · lowest ${formatSar(rfq.lowestBid)}` : ""}
          </Text>
        )}
        {rfq.status === "OPEN" && left !== null ? (
          <Text style={[typography.caption, left <= 1 && { color: colors.danger }]}>
            {left > 0 ? `${left}d left` : "closing"}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function RfqList({ supplierView }: { supplierView: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const [status, setStatus] = useState<"" | RfqStatus>("");
  const [items, setItems] = useState<MarketRfq[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const fetchPage = useCallback(
    async (target: number, mode: "reset" | "more" | "refresh") => {
      const id = ++reqId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const res = supplierView
          ? await api.marketplaceRfqs({ page: target })
          : await api.myRfqs({ page: target, status: status || undefined });
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
    },
    [supplierView, status],
  );

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  // Refresh silently when the tab regains focus (after creating an RFQ / bidding).
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
        <View>
          <Text style={styles.heading}>{supplierView ? t("marketplace") : t("myRfqs")}</Text>
          <Text style={typography.caption}>
            {supplierView
              ? `Open requests${user?.company?.city ? ` near ${user.company.city}` : ""}`
              : "Track quotes and bids"}
          </Text>
        </View>
        {!supplierView ? (
          <Button title={t("newRfq")} icon="add" size="sm" onPress={() => router.push("/rfq/new")} />
        ) : null}
      </View>
      {!supplierView ? (
        <View style={styles.filters}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={STATUS_FILTERS}
            keyExtractor={(f) => f.value || "all"}
            contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            renderItem={({ item }) => (
              <Chip label={item.label} active={status === item.value} onPress={() => setStatus(item.value)} />
            )}
          />
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => fetchPage(1, "refresh")}
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            supplierView ? (
              <EmptyState icon="storefront-outline" title="No open RFQs right now" message="New requests from buyers will appear here." />
            ) : (
              <EmptyState
                icon="document-text-outline"
                title="No RFQs yet"
                message="Request quotes for the materials you need and let suppliers compete."
                actionTitle={t("newRfq")}
                onAction={() => router.push("/rfq/new")}
              />
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
          renderItem={({ item }) => (
            <RfqRow rfq={item} supplierView={supplierView} onPress={() => router.push(`/rfq/${item.id}`)} />
          )}
        />
      )}
    </Screen>
  );
}

export default function RfqsTab() {
  const { isSupplier } = useAuth();
  return (
    <RequireAuth message="Log in to see your RFQs or the open marketplace.">
      <RfqList supplierView={isSupplier} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  heading: { ...typography.h1, fontSize: 22 },
  filters: { paddingVertical: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { ...typography.h3, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, flexWrap: "wrap" },
  dot: { ...typography.caption, marginHorizontal: 6 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  bidFlag: { flexDirection: "row", alignItems: "center", gap: 4 },
  bidFlagText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
});
