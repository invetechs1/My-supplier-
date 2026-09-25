import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Screen, Button, Card, EmptyState, ErrorView, LoadingView, RequireAuth, BottomSheet, TextField } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

function ListsContent() {
  const router = useRouter();
  const { t } = useI18n();
  const lists = useApi(() => api.wishlists(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      lists.silentReload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const list = await api.createWishlist(trimmed);
      setName("");
      setCreateOpen(false);
      lists.silentReload();
      router.push(`/lists/${list.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (lists.loading && !lists.data) return <LoadingView />;
  if (lists.error && !lists.data) return <ErrorView message={lists.error} onRetry={lists.reload} />;
  const data = lists.data ?? [];

  return (
    <Screen scroll refreshing={lists.refreshing} onRefresh={lists.refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("myLists") }} />
      <Button title={t("newList")} icon="add" variant="secondary" fullWidth onPress={() => setCreateOpen(true)} style={{ marginTop: spacing.lg, marginBottom: spacing.md }} />
      {data.length === 0 ? (
        <EmptyState icon="heart-outline" title={t("noListsYet")} message={t("noListsHint")} actionTitle={t("shop")} onAction={() => router.push("/(tabs)/shop")} />
      ) : (
        data.map((l) => (
          <Card key={l.id} onPress={() => router.push(`/lists/${l.id}`)} style={styles.card}>
            <View style={styles.icon}>
              <Ionicons name={l.isDefault ? "heart" : "bookmark"} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {l.name}
                </Text>
                {l.isDefault ? <Text style={styles.pill}>{t("defaultLabel")}</Text> : null}
              </View>
              <Text style={typography.caption}>
                {l.itemCount ?? 0} {(l.itemCount ?? 0) === 1 ? t("item") : t("items")} · {formatDate(l.updatedAt)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        ))
      )}

      <BottomSheet visible={createOpen} onClose={() => setCreateOpen(false)} title={t("newList")}>
        <TextField label={t("listName")} value={name} onChangeText={setName} placeholder={t("listNamePlaceholder")} autoFocus maxLength={60} returnKeyType="done" onSubmitEditing={() => void create()} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title={t("createList")} size="lg" fullWidth loading={busy} disabled={name.trim().length < 2} onPress={() => void create()} />
      </BottomSheet>
    </Screen>
  );
}

export default function ListsScreen() {
  return (
    <RequireAuth>
      <ListsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  name: { ...typography.body, fontWeight: "700", flexShrink: 1 },
  pill: { ...typography.caption, color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm, fontWeight: "600", overflow: "hidden" },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
});
