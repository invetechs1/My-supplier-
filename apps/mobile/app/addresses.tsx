import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import type { Address } from "@mysupplier/shared";
import { Screen, Button, Card, EmptyState, ErrorView, LoadingView, RequireAuth, AddressSheet } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

function AddressesContent() {
  const { t } = useI18n();
  const addresses = useApi(() => api.addresses(), []);
  const [editing, setEditing] = useState<Address | null | undefined>(undefined); // undefined = closed, null = new
  const [busy, setBusy] = useState<string | null>(null);

  const upsert = (a: Address) =>
    addresses.setData((prev) => {
      const rest = (prev ?? []).filter((x) => x.id !== a.id).map((x) => (a.isDefault ? { ...x, isDefault: false } : x));
      return [a, ...rest].sort((x, y) => Number(y.isDefault) - Number(x.isDefault));
    });

  const makeDefault = async (a: Address) => {
    setBusy(a.id);
    try {
      const updated = await api.setDefaultAddress(a.id);
      upsert({ ...a, ...updated, isDefault: true });
    } catch (err) {
      Alert.alert(t("addresses"), getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = (a: Address) => {
    Alert.alert(t("deleteAddress"), t("deleteAddressConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          setBusy(a.id);
          try {
            await api.deleteAddress(a.id);
            addresses.silentReload();
          } catch (err) {
            Alert.alert(t("deleteAddress"), getErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  if (addresses.loading && !addresses.data) return <LoadingView />;
  if (addresses.error && !addresses.data) return <ErrorView message={addresses.error} onRetry={addresses.reload} />;
  const data = addresses.data ?? [];

  return (
    <Screen scroll refreshing={addresses.refreshing} onRefresh={addresses.refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("addresses") }} />
      <Button title={t("addAddress")} icon="add" variant="secondary" fullWidth onPress={() => setEditing(null)} style={{ marginTop: spacing.lg, marginBottom: spacing.md }} />
      {data.length === 0 ? (
        <EmptyState icon="location-outline" title={t("noAddresses")} message={t("noAddressesHint")} actionTitle={t("addAddress")} onAction={() => setEditing(null)} />
      ) : (
        data.map((a) => (
          <Card key={a.id}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Ionicons name={a.isDefault ? "home" : "location-outline"} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.label}>{a.label}</Text>
                  {a.isDefault ? <Text style={styles.pill}>{t("defaultLabel")}</Text> : null}
                </View>
                <Text style={typography.caption}>
                  {a.recipient} · {a.phone}
                </Text>
              </View>
              <Pressable onPress={() => setEditing(a)} hitSlop={8} accessibilityLabel={t("edit")}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={styles.address}>{[a.street, a.building, a.district, a.city].filter(Boolean).join(", ")}</Text>
            {a.notes ? <Text style={typography.caption}>{a.notes}</Text> : null}
            <View style={styles.actions}>
              {!a.isDefault ? <Button title={t("setDefault")} size="sm" variant="outline" loading={busy === a.id} onPress={() => void makeDefault(a)} /> : <View />}
              <Button title={t("delete")} size="sm" variant="ghost" textStyle={{ color: colors.danger }} disabled={busy === a.id} onPress={() => remove(a)} />
            </View>
          </Card>
        ))
      )}
      <AddressSheet visible={editing !== undefined} address={editing ?? null} onClose={() => setEditing(undefined)} onSaved={upsert} />
    </Screen>
  );
}

export default function AddressesScreen() {
  return (
    <RequireAuth>
      <AddressesContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  label: { ...typography.body, fontWeight: "700" },
  pill: { ...typography.caption, color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm, fontWeight: "600", overflow: "hidden" },
  address: { ...typography.bodySmall, color: colors.text },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
});
