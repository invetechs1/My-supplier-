import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Material } from "@mysupplier/shared";
import { api, getErrorMessage } from "@/lib/api";
import { formatSar } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { colors, radius, spacing, typography } from "@/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (material: Material) => void;
}

/** Searchable modal listing materials from GET /materials?q= */
export function MaterialSearchModal({ visible, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .materials({ q: debounced, pageSize: 30, sort: "name" })
      .then((res) => {
        if (!cancelled) setItems(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select material</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or SKU"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoFocus
          />
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No materials match your search</Text> : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {item.sku} · {item.unit}
                  {item.avgPrice != null ? ` · avg ${formatSar(item.avgPrice)}` : ""}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...typography.h3 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.neutralLight,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  error: { ...typography.caption, color: colors.danger, paddingHorizontal: spacing.lg },
  empty: { ...typography.bodySmall, textAlign: "center", padding: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowTitle: { ...typography.body, fontWeight: "500" },
  rowSub: { ...typography.caption, marginTop: 2 },
});
