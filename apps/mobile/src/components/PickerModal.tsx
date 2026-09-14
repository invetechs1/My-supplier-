import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";

export interface PickerOption<T extends string = string> {
  value: T;
  label: string;
  subtitle?: string;
}

interface PickerModalProps<T extends string> {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  value?: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
  searchable?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
}

export function PickerModal<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  searchable = false,
  allowClear = false,
  clearLabel = "Any",
}: PickerModalProps<T>) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.subtitle ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        {searchable ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoFocus
            />
          </View>
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            allowClear ? (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect("" as T);
                  onClose();
                }}
              >
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{clearLabel}</Text>
                {!value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>No options</Text>}
          renderItem={({ item }) => {
            const selected = item.value === value;
            return (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, selected && { color: colors.primary, fontWeight: "600" }]}>
                    {item.label}
                  </Text>
                  {item.subtitle ? <Text style={styles.rowSub}>{item.subtitle}</Text> : null}
                </View>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

interface PickerFieldProps {
  label?: string;
  value?: string | null;
  placeholder?: string;
  onPress: () => void;
  error?: string | null;
  style?: ViewStyle;
}

/** A tappable field that opens a PickerModal. */
export function PickerField({ label, value, placeholder = "Select", onPress, error, style }: PickerFieldProps) {
  return (
    <View style={[styles.fieldContainer, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable style={[styles.field, error ? styles.fieldError : null]} onPress={onPress}>
        <Text style={[styles.fieldText, !value && { color: colors.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { ...typography.body },
  rowSub: { ...typography.caption, marginTop: 2 },
  empty: { ...typography.bodySmall, textAlign: "center", padding: spacing.xl },
  fieldContainer: { marginBottom: spacing.md },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  fieldError: { borderColor: colors.danger },
  fieldText: { fontSize: 15, color: colors.text, flex: 1 },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
});
