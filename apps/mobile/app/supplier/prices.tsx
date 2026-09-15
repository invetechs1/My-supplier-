import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SAUDI_CITIES, type Material, type PriceListing, type UpsertPricePayload } from "@mysupplier/shared";
import {
  Screen,
  Button,
  TextField,
  PickerField,
  PickerModal,
  MaterialSearchModal,
  EmptyState,
  ErrorView,
  LoadingView,
  RequireAuth,
  StatusBadge,
} from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatSar, timeAgo } from "@/lib/format";
import { colors, radius, spacing, typography, shadow } from "@/theme";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

interface EditorState {
  listingId?: string;
  material: Material | null;
  price: string;
  city: string;
  minQty: string;
  leadTimeDays: string;
}

function PriceEditor({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: EditorState;
  onClose: () => void;
  onSaved: (listing: PriceListing) => void;
}) {
  const [state, setState] = useState<EditorState>(initial);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setState(initial);
      setErrors({});
    }
  }, [visible, initial]);

  const patch = (p: Partial<EditorState>) => setState((s) => ({ ...s, ...p }));

  const save = async () => {
    const next: Record<string, string> = {};
    if (!state.material) next.material = "Select a material";
    const price = Number(state.price);
    if (!state.price || Number.isNaN(price) || price <= 0) next.price = "Enter a valid price";
    if (!state.city) next.city = "Select a city";
    setErrors(next);
    if (Object.keys(next).length || !state.material) return;

    const payload: UpsertPricePayload = {
      materialId: state.material.id,
      price,
      city: state.city,
      minQty: state.minQty ? Number(state.minQty) : undefined,
      leadTimeDays: state.leadTimeDays ? Number(state.leadTimeDays) : undefined,
    };
    setSaving(true);
    try {
      const listing = await api.upsertPrice(payload);
      onSaved({ ...listing, material: listing.material ?? state.material });
      onClose();
    } catch (err) {
      Alert.alert("Could not save price", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <View style={styles.modalHeader}>
          <Text style={typography.h3}>{state.listingId ? "Update price" : "Add price"}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          <PickerField
            label="Material"
            value={state.material ? `${state.material.name} (${state.material.unit})` : undefined}
            placeholder="Search material"
            onPress={() => !state.listingId && setMaterialOpen(true)}
            error={errors.material}
          />
          <TextField
            label={`Price (SAR${state.material ? ` / ${state.material.unit}` : ""})`}
            value={state.price}
            onChangeText={(v) => patch({ price: v.replace(/[^0-9.]/g, "") })}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={errors.price}
          />
          <PickerField label="City" value={state.city} placeholder="Select city" onPress={() => setCityOpen(true)} error={errors.city} />
          <View style={styles.row}>
            <TextField
              label="Min quantity"
              value={state.minQty}
              onChangeText={(v) => patch({ minQty: v.replace(/[^0-9.]/g, "") })}
              keyboardType="decimal-pad"
              placeholder="1"
              containerStyle={{ flex: 1 }}
            />
            <TextField
              label="Lead time (days)"
              value={state.leadTimeDays}
              onChangeText={(v) => patch({ leadTimeDays: v.replace(/[^0-9]/g, "") })}
              keyboardType="number-pad"
              placeholder="3"
              containerStyle={{ flex: 1 }}
            />
          </View>
          <Text style={[typography.caption, { marginBottom: spacing.lg }]}>
            Prices are upserted per material and city: saving the same combination again updates the existing listing.
          </Text>
          <Button title="Save price" size="lg" fullWidth loading={saving} onPress={save} />
        </ScrollView>
        <MaterialSearchModal visible={materialOpen} onClose={() => setMaterialOpen(false)} onSelect={(m) => patch({ material: m })} />
        <PickerModal visible={cityOpen} title="City" options={CITY_OPTIONS} value={state.city} onSelect={(c) => patch({ city: c })} onClose={() => setCityOpen(false)} searchable />
      </SafeAreaView>
    </Modal>
  );
}

function PricesContent() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<PriceListing[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ visible: boolean; initial: EditorState }>({
    visible: false,
    initial: { material: null, price: "", city: user?.company?.city ?? "", minQty: "1", leadTimeDays: "3" },
  });
  const reqId = useRef(0);

  const fetchPage = useCallback(async (target: number, mode: "reset" | "more" | "refresh") => {
    const id = ++reqId.current;
    if (mode === "reset") setLoading(true);
    if (mode === "more") setLoadingMore(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const res = await api.supplierPrices(target);
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

  const openAdd = () =>
    setEditor({
      visible: true,
      initial: { material: null, price: "", city: user?.company?.city ?? "", minQty: "1", leadTimeDays: "3" },
    });

  const openEdit = (l: PriceListing) =>
    setEditor({
      visible: true,
      initial: {
        listingId: l.id,
        material: l.material ?? null,
        price: String(l.price),
        city: l.city,
        minQty: String(l.minQty),
        leadTimeDays: String(l.leadTimeDays),
      },
    });

  const onSaved = (listing: PriceListing) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === listing.id || (p.materialId === listing.materialId && p.city === listing.city));
      if (idx === -1) {
        setTotal((t) => t + 1);
        return [listing, ...prev];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...listing };
      return next;
    });
  };

  const remove = (l: PriceListing) =>
    Alert.alert("Delete price", `Remove ${l.material?.name ?? "this listing"} in ${l.city}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(l.id);
          try {
            await api.deletePrice(l.id);
            setItems((prev) => prev.filter((p) => p.id !== l.id));
            setTotal((t) => Math.max(0, t - 1));
          } catch (err) {
            Alert.alert("Error", getErrorMessage(err));
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);

  const hasMore = items.length < total;

  return (
    <Screen padded={false} edges={["bottom", "left", "right"]}>
      <View style={styles.header}>
        <Text style={[typography.bodySmall, { flex: 1 }]} numberOfLines={1}>
          {total} listing{total === 1 ? "" : "s"} · {user?.company?.name ?? "My company"}
        </Text>
        <View style={styles.headerActions}>
          <Button title={t("scanPriceList")} icon="scan-outline" size="sm" variant="secondary" onPress={() => router.push("/imports/new")} />
          <Button title="Add price" icon="add" size="sm" onPress={openAdd} />
        </View>
      </View>
      {loading && items.length === 0 ? (
        <LoadingView />
      ) : error && items.length === 0 ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => fetchPage(1, "refresh")}
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState icon="pricetags-outline" title="No prices listed" message="Add your prices so buyers can find you and compare." actionTitle="Add price" onAction={openAdd} />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
          renderItem={({ item }) => (
            <Pressable onPress={() => openEdit(item)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.material?.name ?? item.materialId}
                </Text>
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={typography.caption}>{item.city}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={typography.caption}>min {item.minQty}</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={typography.caption}>{item.leadTimeDays}d lead</Text>
                </View>
                <View style={[styles.metaRow, { marginTop: 6, gap: spacing.sm }]}>
                  <StatusBadge status={item.source} small />
                  <Text style={typography.caption}>Updated {timeAgo(item.updatedAt)}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: spacing.sm }}>
                <Text style={styles.price}>{formatSar(item.price)}</Text>
                <Text style={typography.caption}>/ {item.material?.unit ?? "unit"}</Text>
                <Pressable onPress={() => remove(item)} hitSlop={8} disabled={deleting === item.id}>
                  {deleting === item.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  )}
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
      <PriceEditor visible={editor.visible} initial={editor.initial} onClose={() => setEditor((e) => ({ ...e, visible: false }))} onSaved={onSaved} />
    </Screen>
  );
}

export default function SupplierPricesScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="Only supplier accounts can manage a price list.">
      <PricesContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  list: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardTitle: { ...typography.h3 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, flexWrap: "wrap" },
  dot: { ...typography.caption, marginHorizontal: 6 },
  price: { fontSize: 17, fontWeight: "700", color: colors.primary },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalBody: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: "row", gap: spacing.md },
});
