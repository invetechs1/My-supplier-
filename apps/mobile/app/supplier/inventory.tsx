import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { InventoryItem } from "@mysupplier/shared";
import { Screen, EmptyState, ErrorView, LoadingView, RequireAuth, ProductImage } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { colors, radius, spacing, typography, shadow } from "@/theme";

function stockText(n: number | null): string {
  return n === null || n === undefined ? "—" : String(n);
}

function InventoryCard({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const { t } = useI18n();
  const { listing } = item;
  const tracked = item.stock !== null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.cardTop}>
        <ProductImage material={listing.material} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {listing.material?.name ?? listing.materialId}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={typography.caption} numberOfLines={1}>
              {listing.branch ? `${listing.branch.name} · ${listing.branch.city}` : listing.city}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.price}>{formatSar(listing.price)}</Text>
          <Text style={typography.caption}>/ {listing.material?.unit ?? "unit"}</Text>
        </View>
      </View>
      <View style={styles.stockRow}>
        <View style={styles.stockCell}>
          <Text style={typography.caption}>{t("stock")}</Text>
          <Text style={[styles.stockValue, item.lowStock && { color: colors.danger }]}>{tracked ? stockText(item.stock) : t("onRequest")}</Text>
        </View>
        <View style={styles.stockCell}>
          <Text style={typography.caption}>Reserved</Text>
          <Text style={styles.stockValue}>{item.reserved}</Text>
        </View>
        <View style={styles.stockCell}>
          <Text style={typography.caption}>Available</Text>
          <Text style={styles.stockValue}>{tracked ? stockText(item.available) : "—"}</Text>
        </View>
        <View style={styles.stockCell}>
          <Text style={typography.caption}>Sold 30d</Text>
          <Text style={styles.stockValue}>{item.soldLast30d}</Text>
        </View>
      </View>
      {item.lowStock ? (
        <View style={styles.lowBadge}>
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text style={styles.lowBadgeText}>{t("lowStock")}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function InventoryContent() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ lowStock?: string }>();
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(params.lowStock === "1");
  const debounced = useDebounce(query, 350);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const focusedOnce = useRef(false);

  const fetchPage = useCallback(
    async (target: number, mode: "reset" | "more" | "refresh") => {
      const id = ++reqId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const res = await api.inventory({ q: debounced.trim() || undefined, lowStock: lowOnly ? 1 : undefined, page: target });
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
    [debounced, lowOnly],
  );

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  // Refresh quietly when coming back from the detail screen (stock may have changed).
  // The callback is stable so filter changes do not trigger a second fetch here.
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) fetchRef.current(1, "refresh");
      focusedOnce.current = true;
    }, []),
  );

  const hasMore = items.length < total;

  return (
    <Screen padded={false} edges={["bottom", "left", "right"]}>
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search products"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.toggleRow}>
          <Text style={[typography.bodySmall, { flex: 1 }]}>
            {total} item{total === 1 ? "" : "s"}
          </Text>
          <Text style={[typography.label, lowOnly && { color: colors.danger }]}>{t("lowStock")} only</Text>
          <Switch value={lowOnly} onValueChange={setLowOnly} trackColor={{ true: colors.danger }} thumbColor="#fff" />
        </View>
      </View>
      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.listing.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => fetchPage(1, "refresh")}
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
          }}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={lowOnly ? "No low-stock items" : "No inventory yet"}
              message={lowOnly ? "Everything is above your low-stock threshold." : "Add prices first; each listing then appears here so you can track stock."}
              actionTitle={lowOnly ? undefined : "Add price"}
              onAction={lowOnly ? undefined : () => router.push("/supplier/prices")}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
          renderItem={({ item }) => (
            <InventoryCard
              item={item}
              onPress={() => router.push({ pathname: "/supplier/inventory/[listingId]", params: { listingId: item.listing.id, q: item.listing.material?.name ?? "" } })}
            />
          )}
        />
      )}
    </Screen>
  );
}

export default function SupplierInventoryScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="Only supplier accounts can manage inventory.">
      <InventoryContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardTop: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  cardTitle: { ...typography.h3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  price: { fontSize: 16, fontWeight: "700", color: colors.primary },
  stockRow: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stockCell: { flex: 1 },
  stockValue: { ...typography.body, fontWeight: "700", marginTop: 2 },
  lowBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: spacing.sm, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.dangerLight },
  lowBadgeText: { fontSize: 11, fontWeight: "700", color: colors.danger },
});
