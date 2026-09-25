import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SAUDI_CITIES, type AttributeFacet, type Category, type Product, type ProductFacets, type ShopSuggestions } from "@mysupplier/shared";
import { Screen, Chip, PickerModal, EmptyState, ErrorView, LoadingView, ProductCard, CartButton, BottomSheet, Button, Stars, ProductImage } from "@/components";
import { api, getErrorMessage, specQuery, type ShopSort, type SpecFilterValue } from "@/lib/api";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { colors, radius, spacing, typography } from "@/theme";

const PAGE_SIZE = 20;
const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));
const SORT_VALUES: ShopSort[] = ["relevance", "price_asc", "price_desc", "rating", "newest", "popular"];
const SORT_KEYS: Record<ShopSort, TranslationKey> = {
  relevance: "sortRelevance",
  price_asc: "sortPriceAsc",
  price_desc: "sortPriceDesc",
  rating: "sortRating",
  newest: "sortNewest",
  popular: "sortPopular",
};
const RATING_OPTIONS = [4, 3, 2];
const BRANDS_PREVIEW = 8;

interface Filters {
  sort: ShopSort;
  minPrice?: number;
  maxPrice?: number;
  inStock: boolean;
  minRating?: number;
  brands: string[];
  specs: Record<string, SpecFilterValue>;
}

const EMPTY_FILTERS: Filters = { sort: "relevance", inStock: false, brands: [], specs: {} };

function asSort(value: string | undefined): ShopSort {
  return value && (SORT_VALUES as string[]).includes(value) ? (value as ShopSort) : "relevance";
}

function toNumber(text: string): number | undefined {
  const n = Number(text.replace(/,/g, "").trim());
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function specCount(specs: Record<string, SpecFilterValue>): number {
  return Object.values(specs).filter((v) => ("values" in v ? v.values.length > 0 : v.min !== undefined || v.max !== undefined)).length;
}

function activeCount(f: Filters): number {
  return (
    (f.sort !== "relevance" ? 1 : 0) +
    (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0) +
    (f.inStock ? 1 : 0) +
    (f.minRating ? 1 : 0) +
    f.brands.length +
    specCount(f.specs)
  );
}

// ---------------------------------------------------------------- filter sheet

function CheckRow({ label, count, checked, onPress }: { label: string; count?: number; checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.primary : colors.textMuted} />
      <Text style={[styles.checkLabel, checked && { color: colors.text, fontWeight: "600" }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? <Text style={typography.caption}>{count}</Text> : null}
    </Pressable>
  );
}

function RangeInputs({ min, max, onChange, unit, hint }: { min?: number; max?: number; onChange: (min?: number, max?: number) => void; unit?: string | null; hint?: string }) {
  const { t } = useI18n();
  const [minText, setMinText] = useState(min !== undefined ? String(min) : "");
  const [maxText, setMaxText] = useState(max !== undefined ? String(max) : "");
  useEffect(() => setMinText(min !== undefined ? String(min) : ""), [min]);
  useEffect(() => setMaxText(max !== undefined ? String(max) : ""), [max]);
  return (
    <View>
      <View style={styles.rangeRow}>
        <View style={styles.rangeField}>
          <TextInput
            value={minText}
            onChangeText={setMinText}
            onEndEditing={() => onChange(toNumber(minText), max)}
            placeholder={t("min")}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={styles.rangeInput}
          />
          {unit ? <Text style={typography.caption}>{unit}</Text> : null}
        </View>
        <Text style={typography.caption}>—</Text>
        <View style={styles.rangeField}>
          <TextInput
            value={maxText}
            onChangeText={setMaxText}
            onEndEditing={() => onChange(min, toNumber(maxText))}
            placeholder={t("max")}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={styles.rangeInput}
          />
          {unit ? <Text style={typography.caption}>{unit}</Text> : null}
        </View>
      </View>
      {hint ? <Text style={[typography.caption, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

function AttributeFacetBlock({ facet, value, onChange }: { facet: AttributeFacet; value: SpecFilterValue | undefined; onChange: (next: SpecFilterValue | undefined) => void }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const label = locale === "ar" && facet.labelAr ? facet.labelAr : facet.label;

  if (facet.type === "NUMBER") {
    const range = value && !("values" in value) ? value : {};
    const hint = facet.min !== null && facet.min !== undefined && facet.max !== null && facet.max !== undefined ? `${facet.min} – ${facet.max}${facet.unit ? ` ${facet.unit}` : ""}` : undefined;
    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>
          {label}
          {facet.unit ? <Text style={typography.caption}> ({facet.unit})</Text> : null}
        </Text>
        <RangeInputs min={range.min} max={range.max} unit={facet.unit} hint={hint} onChange={(min, max) => onChange(min === undefined && max === undefined ? undefined : { min, max })} />
      </View>
    );
  }

  const selected = value && "values" in value ? value.values : [];
  // Keep selected values visible even when the narrowed facet no longer lists them.
  const options = [...facet.values];
  selected.forEach((v) => {
    if (!options.some((o) => o.value === v)) options.push({ value: v, count: 0 });
  });
  if (!options.length) return null;
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next.length ? { values: next } : undefined);
  };
  const optionLabel = (v: string) => (facet.type === "BOOLEAN" ? (/^(true|yes|1)$/i.test(v) ? t("yes") : /^(false|no|0)$/i.test(v) ? t("no") : v) : v);
  const shown = expanded ? options : options.slice(0, BRANDS_PREVIEW);
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{label}</Text>
      {shown.map((o) => (
        <CheckRow key={o.value} label={optionLabel(o.value)} count={o.count || undefined} checked={selected.includes(o.value)} onPress={() => toggle(o.value)} />
      ))}
      {options.length > BRANDS_PREVIEW ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
          <Text style={styles.moreLink}>{expanded ? t("showLess") : `${t("showAll")} (${options.length})`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterSheet({ visible, initial, facets, onApply, onClose }: { visible: boolean; initial: Filters; facets: ProductFacets | null; onApply: (f: Filters) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Filters>(initial);
  const [allBrands, setAllBrands] = useState(false);
  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible, initial]);

  const brandOptions = useMemo(() => {
    const opts = [...(facets?.brands ?? [])];
    draft.brands.forEach((b) => {
      if (!opts.some((o) => o.value === b)) opts.push({ value: b, count: 0 });
    });
    return opts;
  }, [facets?.brands, draft.brands]);
  const shownBrands = allBrands ? brandOptions : brandOptions.slice(0, BRANDS_PREVIEW);
  const priceHint = facets?.price.min !== null && facets?.price.min !== undefined && facets.price.max !== null && facets.price.max !== undefined ? `${formatSar(facets.price.min)} – ${formatSar(facets.price.max)}` : undefined;
  const attributeFacets = (facets?.attributes ?? []).filter((a) => a.filterable !== false && (a.type === "NUMBER" ? a.min !== null && a.min !== undefined : a.values.length > 0 || Boolean(draft.specs[a.key])));

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t("filters")}
      subtitle={facets ? `${facets.total} ${t("results")}` : undefined}
      headerRight={
        <Pressable onPress={() => setDraft({ ...EMPTY_FILTERS, sort: draft.sort })} hitSlop={8}>
          <Text style={styles.resetLink}>{t("reset")}</Text>
        </Pressable>
      }
      footer={
        <Button
          title={t("apply")}
          size="lg"
          fullWidth
          onPress={() => {
            onApply(draft);
            onClose();
          }}
        />
      }
    >
      <View style={styles.block}>
        <Text style={styles.blockTitle}>{t("sortBy")}</Text>
        <View style={styles.wrapRow}>
          {SORT_VALUES.map((s) => (
            <Chip key={s} label={t(SORT_KEYS[s])} active={draft.sort === s} onPress={() => setDraft((d) => ({ ...d, sort: s }))} />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{t("priceRange")} (SAR)</Text>
        <RangeInputs min={draft.minPrice} max={draft.maxPrice} hint={priceHint} onChange={(min, max) => setDraft((d) => ({ ...d, minPrice: min, maxPrice: max }))} />
      </View>

      <View style={[styles.block, styles.switchRow]}>
        <Text style={styles.blockTitle}>{t("inStock")}</Text>
        <Switch value={draft.inStock} onValueChange={(v) => setDraft((d) => ({ ...d, inStock: v }))} trackColor={{ true: colors.primary }} />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{t("rating")}</Text>
        {RATING_OPTIONS.map((r) => {
          const checked = draft.minRating === r;
          return (
            <Pressable key={r} onPress={() => setDraft((d) => ({ ...d, minRating: checked ? undefined : r }))} style={styles.checkRow} accessibilityRole="radio" accessibilityState={{ selected: checked }}>
              <Ionicons name={checked ? "radio-button-on" : "radio-button-off"} size={22} color={checked ? colors.primary : colors.textMuted} />
              <Stars value={r} size={15} />
              <Text style={styles.checkLabel}>{t("andUp")}</Text>
            </Pressable>
          );
        })}
      </View>

      {brandOptions.length ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t("brands")}</Text>
          {shownBrands.map((b) => (
            <CheckRow
              key={b.value}
              label={b.value}
              count={b.count || undefined}
              checked={draft.brands.includes(b.value)}
              onPress={() => setDraft((d) => ({ ...d, brands: d.brands.includes(b.value) ? d.brands.filter((x) => x !== b.value) : [...d.brands, b.value] }))}
            />
          ))}
          {brandOptions.length > BRANDS_PREVIEW ? (
            <Pressable onPress={() => setAllBrands((v) => !v)} hitSlop={6}>
              <Text style={styles.moreLink}>{allBrands ? t("showLess") : `${t("showAll")} (${brandOptions.length})`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {attributeFacets.map((a) => (
        <AttributeFacetBlock
          key={a.key}
          facet={a}
          value={draft.specs[a.key]}
          onChange={(next) =>
            setDraft((d) => {
              const specs = { ...d.specs };
              if (next) specs[a.key] = next;
              else delete specs[a.key];
              return { ...d, specs };
            })
          }
        />
      ))}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------- suggestions

function SuggestionsPanel({ data, loading, onProduct, onCategory, onBrand }: { data: ShopSuggestions | null; loading: boolean; onProduct: (id: string) => void; onCategory: (c: ShopSuggestions["categories"][number]) => void; onBrand: (b: string) => void }) {
  const { t, locale } = useI18n();
  const empty = !loading && data && !data.products.length && !data.categories.length && !data.brands.length;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.suggestList}>
      {loading && !data ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      {empty ? <Text style={[typography.bodySmall, { padding: spacing.lg, textAlign: "center" }]}>{t("noProductsFound")}</Text> : null}
      {data?.categories.length ? (
        <>
          <Text style={styles.suggestHead}>{t("categories")}</Text>
          {data.categories.map((c) => (
            <Pressable key={c.id} style={styles.suggestRow} onPress={() => onCategory(c)}>
              <View style={styles.suggestIcon}>
                <Text style={{ fontSize: 16 }}>{c.icon || "📦"}</Text>
              </View>
              <Text style={styles.suggestText} numberOfLines={1}>
                {locale === "ar" ? c.nameAr : c.name}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </>
      ) : null}
      {data?.brands.length ? (
        <>
          <Text style={styles.suggestHead}>{t("brands")}</Text>
          {data.brands.map((b) => (
            <Pressable key={b} style={styles.suggestRow} onPress={() => onBrand(b)}>
              <View style={styles.suggestIcon}>
                <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              </View>
              <Text style={styles.suggestText} numberOfLines={1}>
                {b}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </>
      ) : null}
      {data?.products.length ? (
        <>
          <Text style={styles.suggestHead}>{t("products")}</Text>
          {data.products.map((p) => (
            <Pressable key={p.id} style={styles.suggestRow} onPress={() => onProduct(p.id)}>
              <ProductImage material={{ sku: p.sku, name: p.name, imageUrl: p.imageUrl, categoryId: "", category: undefined }} size={40} rounded={radius.sm} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestText} numberOfLines={1}>
                  {locale === "ar" ? p.nameAr || p.name : p.name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {p.categoryName} · {p.sku}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- screen

export default function ShopSearchScreen() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const params = useLocalSearchParams<{ categoryId?: string; q?: string; sort?: string; city?: string; brand?: string }>();

  const [query, setQuery] = useState(params.q ?? "");
  const debouncedQuery = useDebounce(query, 350);
  const [categoryId, setCategoryId] = useState<string>(params.categoryId ?? "");
  const [city, setCity] = useState<string>(params.city ?? "");
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, sort: asSort(params.sort), brands: params.brand ? [params.brand] : [] });
  const [cityOpen, setCityOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [facets, setFacets] = useState<ProductFacets | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Suggestions while typing (hidden once the user submits or picks one).
  const [focused, setFocused] = useState(false);
  const [suppressed, setSuppressed] = useState(Boolean(params.q));
  const [suggestions, setSuggestions] = useState<ShopSuggestions | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestQuery = useDebounce(query, 200);
  const showSuggest = focused && !suppressed && query.trim().length >= 2;

  useEffect(() => {
    if (params.categoryId !== undefined) setCategoryId(params.categoryId);
    if (params.q !== undefined) {
      setQuery(params.q);
      setSuppressed(true);
    }
    if (params.city !== undefined) setCity(params.city);
    if (params.sort !== undefined || params.brand !== undefined) {
      setFilters((f) => ({ ...f, sort: params.sort !== undefined ? asSort(params.sort) : f.sort, brands: params.brand ? [params.brand] : f.brands }));
    }
  }, [params.categoryId, params.q, params.sort, params.city, params.brand]);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const q = suggestQuery.trim();
    if (q.length < 2) {
      setSuggestions(null);
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    api
      .shopSuggest(q)
      .then((res) => {
        if (!cancelled) setSuggestions(res);
      })
      .catch(() => {
        if (!cancelled) setSuggestions({ products: [], categories: [], brands: [] });
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [suggestQuery]);

  const fetchPage = useCallback(
    async (targetPage: number, mode: "reset" | "more" | "refresh") => {
      const id = ++requestId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const res = await api.shopProducts({
          q: debouncedQuery.trim() || undefined,
          categoryId: categoryId || undefined,
          city: city || undefined,
          brand: filters.brands.length ? filters.brands.join(",") : undefined,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          inStock: filters.inStock ? 1 : undefined,
          minRating: filters.minRating,
          sort: filters.sort,
          page: targetPage,
          pageSize: PAGE_SIZE,
          ...specQuery(filters.specs),
        });
        if (id !== requestId.current) return;
        setTotal(res.total);
        setPage(res.page);
        if (res.facets) setFacets(res.facets);
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
    [debouncedQuery, categoryId, city, filters],
  );

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  const hasMore = items.length < total;
  const onEndReached = () => {
    if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
  };

  const clearAll = () => {
    setCategoryId("");
    setCity("");
    setQuery("");
    setFilters(EMPTY_FILTERS);
  };
  const filterCount = activeCount(filters);
  const filtersActive = Boolean(categoryId || city || query || filterCount);
  const activeCategory = categories.find((c) => c.id === categoryId);
  const attrLabel = (key: string) => {
    const a = facets?.attributes.find((x) => x.key === key);
    return a ? (locale === "ar" && a.labelAr ? a.labelAr : a.label) : key;
  };

  /** Removable chips for every active filter. */
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (filters.sort !== "relevance") activeChips.push({ key: "sort", label: t(SORT_KEYS[filters.sort]), onRemove: () => setFilters((f) => ({ ...f, sort: "relevance" })) });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    activeChips.push({
      key: "price",
      label: `${filters.minPrice !== undefined ? formatSar(filters.minPrice) : t("min")} – ${filters.maxPrice !== undefined ? formatSar(filters.maxPrice) : t("max")}`,
      onRemove: () => setFilters((f) => ({ ...f, minPrice: undefined, maxPrice: undefined })),
    });
  }
  if (filters.inStock) activeChips.push({ key: "stock", label: t("inStock"), onRemove: () => setFilters((f) => ({ ...f, inStock: false })) });
  if (filters.minRating) activeChips.push({ key: "rating", label: `${filters.minRating}★ ${t("andUp")}`, onRemove: () => setFilters((f) => ({ ...f, minRating: undefined })) });
  filters.brands.forEach((b) => activeChips.push({ key: `brand:${b}`, label: b, onRemove: () => setFilters((f) => ({ ...f, brands: f.brands.filter((x) => x !== b) })) }));
  Object.entries(filters.specs).forEach(([key, v]) => {
    const label = "values" in v ? `${attrLabel(key)}: ${v.values.join(", ")}` : `${attrLabel(key)}: ${v.min ?? ""}–${v.max ?? ""}`;
    activeChips.push({
      key: `spec:${key}`,
      label,
      onRemove: () =>
        setFilters((f) => {
          const specs = { ...f.specs };
          delete specs[key];
          return { ...f, specs };
        }),
    });
  });

  const submitSearch = () => {
    setSuppressed(true);
    setFocused(false);
  };

  return (
    <Screen padded={false} edges={["left", "right"]}>
      <Stack.Screen
        options={{
          title: activeCategory ? (locale === "ar" ? activeCategory.nameAr : activeCategory.name) : t("shop"),
          headerRight: () => <CartButton />,
        }}
      />
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setSuppressed(false);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={submitSearch}
            placeholder={t("searchProducts")}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoFocus={!params.categoryId && !params.q && !params.sort && !params.brand}
          />
          {query ? (
            <Pressable
              onPress={() => {
                setQuery("");
                setSuppressed(false);
              }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} keyboardShouldPersistTaps="handled">
          <Pressable style={[styles.filterBtn, filterCount ? styles.filterBtnActive : null]} onPress={() => setFiltersOpen(true)}>
            <Ionicons name="options-outline" size={14} color={filterCount ? "#fff" : colors.textSecondary} />
            <Text style={[styles.filterText, filterCount ? styles.filterTextActive : null]}>
              {t("filters")}
              {filterCount ? ` · ${filterCount}` : ""}
            </Text>
          </Pressable>
          <Pressable style={[styles.filterBtn, city ? styles.filterBtnActive : null]} onPress={() => setCityOpen(true)}>
            <Ionicons name="location-outline" size={14} color={city ? "#fff" : colors.textSecondary} />
            <Text style={[styles.filterText, city ? styles.filterTextActive : null]}>{city || t("allCities")}</Text>
          </Pressable>
          <Chip label={t("all")} active={!categoryId} onPress={() => setCategoryId("")} />
          {categories.map((c) => (
            <Chip key={c.id} label={`${c.icon ? `${c.icon} ` : ""}${locale === "ar" ? c.nameAr : c.name}`} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </ScrollView>

        {activeChips.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeRow} keyboardShouldPersistTaps="handled">
            {activeChips.map((c) => (
              <Pressable key={c.key} onPress={c.onRemove} style={styles.activeChip} accessibilityLabel={`${t("remove")} ${c.label}`}>
                <Text style={styles.activeChipText} numberOfLines={1}>
                  {c.label}
                </Text>
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            ))}
            <Pressable onPress={() => setFilters((f) => ({ ...EMPTY_FILTERS, sort: "relevance" }))} hitSlop={6} style={{ justifyContent: "center" }}>
              <Text style={styles.clear}>{t("clearFilters")}</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </View>

      {showSuggest ? (
        <SuggestionsPanel
          data={suggestions}
          loading={suggestLoading}
          onProduct={(id) => {
            submitSearch();
            router.push(`/shop/product/${id}`);
          }}
          onCategory={(c) => {
            setCategoryId(c.id);
            setQuery("");
            submitSearch();
          }}
          onBrand={(b) => {
            setFilters((f) => ({ ...f, brands: f.brands.includes(b) ? f.brands : [...f.brands, b] }));
            setQuery("");
            submitSearch();
          }}
        />
      ) : loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onRefresh={() => fetchPage(1, "refresh")}
          refreshing={refreshing}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <Text style={styles.count}>
              {total} {t("results")}
              {facets?.fuzzy && query ? ` · "${query}"` : ""}
              {filtersActive ? (
                <Text style={styles.clear} onPress={clearAll}>
                  {"  "}· {t("clearFilters")}
                </Text>
              ) : null}
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={t("noProductsFound")}
              message={t("tryDifferentSearch")}
              actionTitle={filtersActive ? t("clearFilters") : undefined}
              onAction={filtersActive ? clearAll : undefined}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} />
            ) : error ? (
              <Text style={styles.footerError}>{error}</Text>
            ) : null
          }
          renderItem={({ item }) => <ProductCard product={item} onPress={() => router.push(`/shop/product/${item.id}`)} />}
        />
      )}

      <PickerModal
        visible={cityOpen}
        title={t("deliverTo")}
        options={CITY_OPTIONS}
        value={city}
        onSelect={setCity}
        onClose={() => setCityOpen(false)}
        searchable
        allowClear
        clearLabel={t("allCities")}
      />
      <FilterSheet visible={filtersOpen} initial={filters} facets={facets} onApply={setFilters} onClose={() => setFiltersOpen(false)} />
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
  activeRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, alignItems: "center" },
  activeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 10, paddingRight: 6, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.primaryLight, maxWidth: 220 },
  activeChipText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: { gap: spacing.md, marginBottom: spacing.md },
  count: { ...typography.caption, marginBottom: spacing.sm },
  clear: { color: colors.primary, fontWeight: "600", fontSize: 12 },
  footerError: { ...typography.caption, color: colors.danger, textAlign: "center", marginVertical: spacing.md },
  // filter sheet
  block: { marginBottom: spacing.lg },
  blockTitle: { ...typography.h3, marginBottom: spacing.sm },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  checkLabel: { ...typography.body, color: colors.textSecondary, flex: 1 },
  moreLink: { color: colors.primary, fontWeight: "600", fontSize: 13, paddingVertical: 6 },
  resetLink: { color: colors.primary, fontWeight: "600", fontSize: 14 },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rangeField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 42, backgroundColor: colors.surface },
  rangeInput: { flex: 1, fontSize: 15, color: colors.text },
  // suggestions
  suggestList: { paddingBottom: spacing.xl },
  suggestHead: { ...typography.label, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  suggestIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  suggestText: { ...typography.body, fontWeight: "500", flex: 1 },
});
