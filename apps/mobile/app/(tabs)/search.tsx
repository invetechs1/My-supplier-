import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SAUDI_CITIES, type Category, type Material } from "@mysupplier/shared";
import { Screen, MaterialCard, Chip, PickerModal, EmptyState, ErrorView, LoadingView } from "@/components";
import { api, getErrorMessage, type MaterialSort } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useDebounce } from "@/hooks/useDebounce";
import { colors, radius, spacing, typography } from "@/theme";

const PAGE_SIZE = 20;
const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));
const SORT_OPTIONS: Array<{ value: MaterialSort; label: string }> = [
  { value: "name", label: "Name" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "updated", label: "Recently updated" },
];

export default function SearchScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ categoryId?: string; q?: string }>();

  const [query, setQuery] = useState(params.q ?? "");
  const debouncedQuery = useDebounce(query, 350);
  const [categoryId, setCategoryId] = useState<string>(params.categoryId ?? "");
  const [city, setCity] = useState<string>("");
  const [sort, setSort] = useState<MaterialSort>("name");
  const [cityOpen, setCityOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Material[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Sync incoming navigation params (e.g. from Home category chips).
  useEffect(() => {
    if (params.categoryId !== undefined) setCategoryId(params.categoryId);
    if (params.q !== undefined) setQuery(params.q);
  }, [params.categoryId, params.q]);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const fetchPage = useCallback(
    async (targetPage: number, mode: "reset" | "more" | "refresh") => {
      const id = ++requestId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const res = await api.materials({
          q: debouncedQuery.trim() || undefined,
          categoryId: categoryId || undefined,
          city: city || undefined,
          sort,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        if (id !== requestId.current) return;
        setTotal(res.total);
        setPage(res.page);
        setItems((prev) => (mode === "more" ? [...prev, ...res.data] : res.data));
      } catch (err) {
        if (id !== requestId.current) return;
        setError(getErrorMessage(err));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [debouncedQuery, categoryId, city, sort],
  );

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  const hasMore = items.length < total;
  const onEndReached = () => {
    if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
  };

  const clearFilters = () => {
    setCategoryId("");
    setCity("");
    setQuery("");
  };

  const filtersActive = Boolean(categoryId || city || query);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pressable style={[styles.filterBtn, city ? styles.filterBtnActive : null]} onPress={() => setCityOpen(true)}>
            <Ionicons name="location-outline" size={14} color={city ? "#fff" : colors.textSecondary} />
            <Text style={[styles.filterText, city ? styles.filterTextActive : null]}>{city || "All cities"}</Text>
          </Pressable>
          <Pressable style={styles.filterBtn} onPress={() => setSortOpen(true)}>
            <Ionicons name="swap-vertical-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.filterText}>{SORT_OPTIONS.find((s) => s.value === sort)?.label}</Text>
          </Pressable>
          <Chip label="All" active={!categoryId} onPress={() => setCategoryId("")} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </ScrollView>
      </View>

      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onRefresh={() => fetchPage(1, "refresh")}
          refreshing={refreshing}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <Text style={styles.count}>
              {total} result{total === 1 ? "" : "s"}
              {filtersActive ? (
                <Text style={styles.clear} onPress={clearFilters}>
                  {"  "}· Clear filters
                </Text>
              ) : null}
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No materials found"
              message="Try a different keyword, category or city."
              actionTitle={filtersActive ? "Clear filters" : undefined}
              onAction={filtersActive ? clearFilters : undefined}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} />
            ) : error ? (
              <Text style={styles.footerError}>{error}</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <MaterialCard material={item} onPress={() => router.push(`/material/${item.id}`)} />
          )}
        />
      )}

      <PickerModal
        visible={cityOpen}
        title="Filter by city"
        options={CITY_OPTIONS}
        value={city}
        onSelect={setCity}
        onClose={() => setCityOpen(false)}
        searchable
        allowClear
        clearLabel="All cities"
      />
      <PickerModal
        visible={sortOpen}
        title="Sort by"
        options={SORT_OPTIONS}
        value={sort}
        onSelect={setSort}
        onClose={() => setSortOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.neutralLight,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  filterRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: "center" },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralLight,
    marginRight: spacing.sm,
  },
  filterBtnActive: { backgroundColor: colors.primary },
  filterText: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  count: { ...typography.caption, marginBottom: spacing.sm },
  clear: { color: colors.primary, fontWeight: "600" },
  footerError: { ...typography.caption, color: colors.danger, textAlign: "center", marginVertical: spacing.md },
});
