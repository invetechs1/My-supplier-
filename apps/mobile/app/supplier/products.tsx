import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { ListingStatus, SupplierProduct, SupplierProductPatch, SupplierProductsResponse } from "@mysupplier/shared";
import {
  Screen,
  Button,
  TextField,
  PickerField,
  PickerModal,
  EmptyState,
  ErrorView,
  LoadingView,
  RequireAuth,
  ProductImage,
} from "@/components";
import { api, getErrorMessage, request } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatSar, timeAgo } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { colors, radius, spacing, typography, shadow } from "@/theme";

type Summary = SupplierProductsResponse["summary"];
type SortKey = "updated" | "name" | "price" | "stock";

const EMPTY_SUMMARY: Summary = { total: 0, active: 0, paused: 0, outOfStock: 0, expired: 0, cheapest: 0 };

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name (A–Z)" },
  { value: "price", label: "Price (low to high)" },
  { value: "stock", label: "Stock (low to high)" },
];

const STATUS_OPTIONS: Array<{ value: ListingStatus; label: string }> = [
  { value: "ACTIVE", label: "Live" },
  { value: "PAUSED", label: "Paused" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "EXPIRED", label: "Expired" },
];

const STATUS_STYLE: Record<ListingStatus, { bg: string; fg: string; label: string }> = {
  ACTIVE: { bg: colors.successLight, fg: colors.success, label: "Live" },
  PAUSED: { bg: colors.neutralLight, fg: colors.textSecondary, label: "Paused" },
  OUT_OF_STOCK: { bg: colors.dangerLight, fg: colors.danger, label: "Out of stock" },
  EXPIRED: { bg: colors.warningLight, fg: colors.warning, label: "Expired" },
};

/** Same rule as the API so optimistic updates show the right badge. */
function computeStatus(p: Pick<SupplierProduct, "active" | "stock" | "validUntil">, now = Date.now()): ListingStatus {
  if (!p.active) return "PAUSED";
  if (p.validUntil && new Date(p.validUntil).getTime() < now) return "EXPIRED";
  if (p.stock !== null && p.stock !== undefined && p.stock <= 0) return "OUT_OF_STOCK";
  return "ACTIVE";
}

/** Fallback tile input: the material without its picture, so ProductImage draws the tinted placeholder. */
function placeholderMaterial(p: SupplierProduct) {
  const c = p.material.category;
  return {
    sku: p.material.sku,
    name: p.material.name,
    imageUrl: null,
    categoryId: c?.id ?? "",
    category: c ? { id: c.id, slug: c.slug, name: c.name, nameAr: c.nameAr, icon: c.icon ?? null } : undefined,
    categorySlug: c?.slug,
  };
}

const SUMMARY_KEY: Record<ListingStatus, keyof Summary> = { ACTIVE: "active", PAUSED: "paused", OUT_OF_STOCK: "outOfStock", EXPIRED: "expired" };

/** PATCH /supplier/prices/:id — the listing endpoint accepts price/stock/minQty/leadTimeDays/active. */
function patchListing(listingId: string, body: SupplierProductPatch) {
  return request<unknown>(`/supplier/prices/${encodeURIComponent(listingId)}`, { method: "PATCH", body });
}

function ProductStatusBadge({ status }: { status: ListingStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

function SummaryChip({ label, value, active, tone, onPress }: { label: string; value: number; active: boolean; tone?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && onPress ? { opacity: 0.85 } : null]}>
      <Text style={[styles.chipValue, tone ? { color: tone } : null, active && styles.chipTextActive]}>{value}</Text>
      <Text style={[styles.chipLabel, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- editor sheet

interface EditorState {
  product: SupplierProduct | null;
  price: string;
  stock: string;
  minQty: string;
  leadTimeDays: string;
}

const EMPTY_EDITOR: EditorState = { product: null, price: "", stock: "", minQty: "", leadTimeDays: "" };

function ProductEditor({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: EditorState;
  onClose: () => void;
  onSaved: (listingId: string, patch: SupplierProductPatch) => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<EditorState>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setState(initial);
      setErrors({});
    }
  }, [visible, initial]);

  const patch = (p: Partial<EditorState>) => setState((s) => ({ ...s, ...p }));
  const product = state.product;

  const save = async () => {
    if (!product) return;
    const next: Record<string, string> = {};
    const price = Number(state.price);
    if (!state.price || Number.isNaN(price) || price <= 0) next.price = "Enter a valid price";
    const minQty = state.minQty ? Number(state.minQty) : product.minQty;
    if (Number.isNaN(minQty) || minQty <= 0) next.minQty = "Enter a valid quantity";
    const leadTimeDays = state.leadTimeDays ? Number(state.leadTimeDays) : 0;
    if (Number.isNaN(leadTimeDays) || leadTimeDays < 0) next.leadTimeDays = "Enter a valid number of days";
    const stock = state.stock.trim() === "" ? null : Number(state.stock);
    if (stock !== null && (Number.isNaN(stock) || stock < 0)) next.stock = "Enter a valid stock or leave empty";
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: SupplierProductPatch = { price, stock, minQty, leadTimeDays };
    setSaving(true);
    try {
      await patchListing(product.id, body);
      onSaved(product.id, body);
      onClose();
    } catch (err) {
      Alert.alert("Could not save", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3} numberOfLines={1}>
              {product?.material.name ?? "Edit product"}
            </Text>
            {product ? (
              <Text style={typography.caption} numberOfLines={1}>
                {product.city} · {product.material.unit}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <TextField
            label={`Price (SAR / ${product?.material.unit ?? "unit"})`}
            value={state.price}
            onChangeText={(v) => patch({ price: v.replace(/[^0-9.]/g, "") })}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.price}
          />
          <TextField
            label={t("stock")}
            value={state.stock}
            onChangeText={(v) => patch({ stock: v.replace(/[^0-9]/g, "") })}
            keyboardType="number-pad"
            placeholder="Leave empty to not track stock"
            hint="Empty = not tracked (shown to buyers as on request). 0 = out of stock."
            error={errors.stock}
          />
          <View style={styles.row}>
            <TextField
              label={t("minQty")}
              value={state.minQty}
              onChangeText={(v) => patch({ minQty: v.replace(/[^0-9.]/g, "") })}
              keyboardType="decimal-pad"
              placeholder="1"
              containerStyle={{ flex: 1 }}
              error={errors.minQty}
            />
            <TextField
              label={`${t("leadTime")} (days)`}
              value={state.leadTimeDays}
              onChangeText={(v) => patch({ leadTimeDays: v.replace(/[^0-9]/g, "") })}
              keyboardType="number-pad"
              placeholder="3"
              containerStyle={{ flex: 1 }}
              error={errors.leadTimeDays}
            />
          </View>
          <Button title={t("save")} size="lg" fullWidth loading={saving} onPress={save} />
          <Button title="Cancel" size="md" fullWidth variant="ghost" onPress={onClose} style={{ marginTop: spacing.sm }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------- card

function ProductCard({
  product,
  uploading,
  toggling,
  onEdit,
  onToggle,
  onPhoto,
  onView,
}: {
  product: SupplierProduct;
  uploading: boolean;
  toggling: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onPhoto: () => void;
  onView: () => void;
}) {
  const { t } = useI18n();
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [product.displayImageUrl]);

  const unit = product.material.unit || "unit";
  const category = product.material.category;
  const stockTracked = product.stock !== null && product.stock !== undefined;

  let competitiveness: { text: string; color: string; icon: keyof typeof Ionicons.glyphMap };
  if (product.competitors === 0) {
    competitiveness = { text: "Only you sell this here", color: colors.textMuted, icon: "ribbon-outline" };
  } else if (product.isCheapest) {
    competitiveness = { text: `Cheapest in ${product.city}`, color: colors.success, icon: "trending-down-outline" };
  } else {
    const best = product.bestCompetitorPrice !== null ? formatSar(product.bestCompetitorPrice) : "—";
    competitiveness = {
      text: `Best competitor ${best} · ${product.competitors} other${product.competitors === 1 ? "" : "s"}`,
      color: colors.warning,
      icon: "trending-up-outline",
    };
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.imageWrap}>
          {product.displayImageUrl && !imgFailed ? (
            <Image source={{ uri: product.displayImageUrl }} style={styles.image} resizeMode="cover" onError={() => setImgFailed(true)} accessibilityLabel={product.material.name} />
          ) : (
            <ProductImage material={placeholderMaterial(product)} size={88} rounded={radius.md} />
          )}
          {uploading ? (
            <View style={styles.imageOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {product.material.name}
          </Text>
          {product.material.nameAr ? (
            <Text style={styles.arabicName} numberOfLines={1}>
              {product.material.nameAr}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {category ? (
              <>
                <Text style={typography.caption} numberOfLines={1}>
                  {category.icon ? `${category.icon} ` : ""}
                  {category.name}
                </Text>
                <Text style={styles.dot}>·</Text>
              </>
            ) : null}
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={typography.caption}>{product.city}</Text>
          </View>
          <View style={[styles.metaRow, { marginTop: 6, gap: spacing.sm }]}>
            <ProductStatusBadge status={product.status} />
            {product.isCheapest ? (
              <View style={[styles.badge, { backgroundColor: colors.successLight }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>Cheapest</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.price}>{formatSar(product.price)}</Text>
          <Text style={typography.caption}>/ {unit}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={typography.caption}>{t("stock")}</Text>
          <Text style={[styles.statValue, stockTracked && (product.stock as number) <= 0 && { color: colors.danger }]} numberOfLines={1}>
            {stockTracked ? `${product.stock} ${unit}` : "Not tracked"}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={typography.caption}>{t("minQty")}</Text>
          <Text style={styles.statValue} numberOfLines={1}>
            {product.minQty} {unit}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={typography.caption}>{t("leadTime")}</Text>
          <Text style={styles.statValue} numberOfLines={1}>
            {product.leadTimeDays}d
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={typography.caption}>Sold 30d</Text>
          <Text style={styles.statValue} numberOfLines={1}>
            {product.sold30d}
          </Text>
        </View>
      </View>

      <View style={styles.competeRow}>
        <Ionicons name={competitiveness.icon} size={14} color={competitiveness.color} />
        <Text style={[styles.competeText, { color: competitiveness.color }]} numberOfLines={1}>
          {competitiveness.text}
        </Text>
        <Text style={typography.caption}>Updated {timeAgo(product.updatedAt)}</Text>
      </View>

      <View style={styles.actions}>
        <Button title="Edit" icon="create-outline" size="sm" variant="secondary" onPress={onEdit} />
        <Button
          title={product.active ? "Pause" : "Resume"}
          icon={product.active ? "pause-circle-outline" : "play-circle-outline"}
          size="sm"
          variant="outline"
          loading={toggling}
          onPress={onToggle}
        />
        <Button title="Photo" icon="camera-outline" size="sm" variant="outline" disabled={uploading} onPress={onPhoto} />
        <Button title="View in shop" icon="storefront-outline" size="sm" variant="ghost" onPress={onView} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- screen

function ProductsContent() {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 350);
  const [status, setStatus] = useState<ListingStatus | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("updated");
  const [statusOpen, setStatusOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const [items, setItems] = useState<SupplierProduct[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [cities, setCities] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ visible: boolean; initial: EditorState }>({ visible: false, initial: EMPTY_EDITOR });
  const reqId = useRef(0);

  const fetchPage = useCallback(
    async (target: number, mode: "reset" | "more" | "refresh") => {
      const id = ++reqId.current;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const res = await api.supplierProducts({
          q: debounced.trim() || undefined,
          status: status ?? undefined,
          city: city ?? undefined,
          sort,
          page: target,
        });
        if (id !== reqId.current) return;
        setTotal(res.total);
        setPage(res.page);
        setSummary(res.summary);
        setCities(res.cities);
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
    [debounced, status, city, sort],
  );

  useEffect(() => {
    fetchPage(1, "reset");
  }, [fetchPage]);

  /** Apply a patch locally (optimistic) and keep the summary counters in sync. */
  const applyLocal = useCallback((listingId: string, patch: Partial<SupplierProduct>) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === listingId);
      if (idx === -1) return prev;
      const before = prev[idx];
      const merged: SupplierProduct = { ...before, ...patch };
      merged.status = computeStatus(merged);
      if (merged.status !== before.status) {
        setSummary((s) => ({
          ...s,
          [SUMMARY_KEY[before.status]]: Math.max(0, s[SUMMARY_KEY[before.status]] - 1),
          [SUMMARY_KEY[merged.status]]: s[SUMMARY_KEY[merged.status]] + 1,
        }));
      }
      const next = [...prev];
      next[idx] = merged;
      return next;
    });
  }, []);

  const openEdit = (p: SupplierProduct) =>
    setEditor({
      visible: true,
      initial: {
        product: p,
        price: String(p.price),
        stock: p.stock === null || p.stock === undefined ? "" : String(p.stock),
        minQty: String(p.minQty),
        leadTimeDays: String(p.leadTimeDays),
      },
    });

  const onSaved = (listingId: string, patch: SupplierProductPatch) => {
    const local: Partial<SupplierProduct> = { updatedAt: new Date().toISOString() };
    if (patch.price !== undefined) local.price = patch.price;
    if (patch.stock !== undefined) local.stock = patch.stock;
    if (patch.minQty !== undefined) local.minQty = patch.minQty;
    if (patch.leadTimeDays !== undefined) local.leadTimeDays = patch.leadTimeDays;
    applyLocal(listingId, local);
  };

  const setActive = async (p: SupplierProduct, active: boolean) => {
    const previous = { active: p.active, status: p.status };
    setToggling(p.id);
    applyLocal(p.id, { active, updatedAt: new Date().toISOString() });
    try {
      await patchListing(p.id, { active });
    } catch (err) {
      applyLocal(p.id, { active: previous.active, updatedAt: p.updatedAt });
      Alert.alert(active ? "Could not resume" : "Could not pause", getErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const toggleActive = (p: SupplierProduct) => {
    if (!p.active) {
      setActive(p, true);
      return;
    }
    Alert.alert("Pause product", `Hide ${p.material.name} in ${p.city} from buyers? You can resume it any time.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Pause", style: "destructive", onPress: () => setActive(p, false) },
    ]);
  };

  const pickAndUpload = async (p: SupplierProduct) => {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Photos access needed", "Allow photo library access in Settings to upload a product photo.");
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        allowsMultipleSelection: false,
        exif: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];

      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        form.append("file", blob, "photo.jpg");
      } else {
        // React Native's FormData accepts { uri, name, type } as a file part.
        form.append("file", { uri: asset.uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
      }

      setUploading(p.id);
      try {
        const updated = await api.uploadListingImage(p.id, form);
        applyLocal(p.id, { imageUrl: updated.imageUrl, displayImageUrl: updated.displayImageUrl, updatedAt: updated.updatedAt ?? new Date().toISOString() });
      } catch (err) {
        Alert.alert("Upload failed", getErrorMessage(err));
      } finally {
        setUploading(null);
      }
    } catch (err) {
      Alert.alert("Could not open photos", getErrorMessage(err));
    }
  };

  const removePhoto = async (p: SupplierProduct) => {
    setUploading(p.id);
    try {
      const updated = await api.deleteListingImage(p.id);
      applyLocal(p.id, { imageUrl: updated.imageUrl ?? null, displayImageUrl: updated.displayImageUrl, updatedAt: updated.updatedAt ?? new Date().toISOString() });
    } catch (err) {
      Alert.alert("Could not remove photo", getErrorMessage(err));
    } finally {
      setUploading(null);
    }
  };

  const onPhoto = (p: SupplierProduct) => {
    if (!p.imageUrl) {
      pickAndUpload(p);
      return;
    }
    Alert.alert("Product photo", "Buyers see this photo on the product page.", [
      { text: "Cancel", style: "cancel" },
      { text: "Change photo", onPress: () => pickAndUpload(p) },
      { text: "Remove photo", style: "destructive", onPress: () => removePhoto(p) },
    ]);
  };

  const hasMore = items.length < total;
  const hasFilters = Boolean(debounced.trim() || status || city);
  const clearFilters = () => {
    setQuery("");
    setStatus(null);
    setCity(null);
  };

  const cityOptions = useMemo(() => cities.map((c) => ({ value: c, label: c })), [cities]);
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Sort";
  const statusLabelText = status ? STATUS_STYLE[status].label : null;

  const chips: Array<{ key: string; label: string; value: number; status?: ListingStatus | null; tone?: string }> = [
    { key: "total", label: t("total"), value: summary.total, status: null },
    { key: "active", label: "Active", value: summary.active, status: "ACTIVE", tone: colors.success },
    { key: "cheapest", label: "Cheapest", value: summary.cheapest, tone: colors.primary },
    { key: "paused", label: "Paused", value: summary.paused, status: "PAUSED", tone: colors.textSecondary },
    { key: "outOfStock", label: t("outOfStock"), value: summary.outOfStock, status: "OUT_OF_STOCK", tone: colors.danger },
    { key: "expired", label: "Expired", value: summary.expired, status: "EXPIRED", tone: colors.warning },
  ];

  return (
    <Screen padded={false} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("myProducts") }} />
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
          {chips.map((c) => (
            <SummaryChip
              key={c.key}
              label={c.label}
              value={c.value}
              tone={c.tone}
              active={c.status === undefined ? false : c.status === status}
              onPress={c.status === undefined ? undefined : () => setStatus(c.status ?? null)}
            />
          ))}
        </ScrollView>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t("searchProducts")}
          returnKeyType="search"
          autoCorrect={false}
          containerStyle={{ marginBottom: 0 }}
          right={
            query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : (
              <Ionicons name="search" size={18} color={colors.textMuted} />
            )
          }
        />
        <View style={styles.filterRow}>
          <PickerField value={statusLabelText} placeholder="All statuses" onPress={() => setStatusOpen(true)} style={styles.filterField} />
          <PickerField value={city} placeholder="All cities" onPress={() => setCityOpen(true)} style={styles.filterField} />
          <PickerField value={sortLabel} onPress={() => setSortOpen(true)} style={styles.filterField} />
        </View>
        <Text style={typography.bodySmall} numberOfLines={1}>
          {total} product{total === 1 ? "" : "s"}
          {hasFilters ? " matching" : ""}
        </Text>
      </View>

      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => fetchPage(1, "refresh")}
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
          }}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            hasFilters ? (
              <EmptyState icon="funnel-outline" title="No matching products" message="Try another search term, status or city." actionTitle="Clear filters" onAction={clearFilters} />
            ) : (
              <EmptyState
                icon="cube-outline"
                title="No products yet"
                message="Add prices to your price list; every listing then appears here so you can manage photos, stock and availability."
                actionTitle="Add price"
                onAction={() => router.push("/supplier/prices")}
              />
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              uploading={uploading === item.id}
              toggling={toggling === item.id}
              onEdit={() => openEdit(item)}
              onToggle={() => toggleActive(item)}
              onPhoto={() => onPhoto(item)}
              onView={() => router.push(`/shop/product/${item.materialId}`)}
            />
          )}
        />
      )}

      <ProductEditor visible={editor.visible} initial={editor.initial} onClose={() => setEditor((e) => ({ ...e, visible: false }))} onSaved={onSaved} />
      <PickerModal
        visible={statusOpen}
        title="Status"
        options={STATUS_OPTIONS}
        value={status}
        onSelect={(s) => setStatus(s)}
        onClose={() => setStatusOpen(false)}
        allowClear
        clearLabel="All statuses"
      />
      <PickerModal
        visible={cityOpen}
        title="City"
        options={cityOptions}
        value={city}
        onSelect={(c) => setCity(c)}
        onClose={() => setCityOpen(false)}
        searchable
        allowClear
        clearLabel="All cities"
      />
      <PickerModal visible={sortOpen} title="Sort by" options={SORT_OPTIONS} value={sort} onSelect={(s) => setSort(s)} onClose={() => setSortOpen(false)} />
    </Screen>
  );
}

export default function SupplierProductsScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="Only supplier accounts can manage products.">
      <ProductsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  chipRow: { gap: spacing.sm, paddingBottom: 2 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minWidth: 72, alignItems: "flex-start" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  chipLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  chipTextActive: { color: "#fff" },
  filterRow: { flexDirection: "row", gap: spacing.sm },
  filterField: { flex: 1, marginBottom: 0 },
  list: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardTop: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  imageWrap: { width: 88, height: 88, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.neutralLight },
  image: { width: 88, height: 88 },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17,24,39,0.45)", alignItems: "center", justifyContent: "center" },
  cardTitle: { ...typography.h3 },
  arabicName: { ...typography.bodySmall, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" },
  dot: { ...typography.caption, marginHorizontal: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  price: { fontSize: 17, fontWeight: "700", color: colors.primary },
  statsRow: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  statCell: { flex: 1 },
  statValue: { ...typography.body, fontWeight: "700", marginTop: 2, fontSize: 14 },
  competeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, flexWrap: "wrap" },
  competeText: { fontSize: 13, fontWeight: "600", flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: "row", gap: spacing.md },
});
