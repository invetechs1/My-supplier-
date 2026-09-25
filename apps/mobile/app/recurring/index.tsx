import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Screen, Button, Card, EmptyState, ErrorView, LoadingView, RequireAuth } from "@/components";
import { api, getErrorMessage, type RecurringOrderRow } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

function intervalLabel(days: number, t: (k: "days" | "week" | "weeks") => string): string {
  if (days % 7 === 0) {
    const w = days / 7;
    return `${w} ${w === 1 ? t("week") : t("weeks")}`;
  }
  return `${days} ${t("days")}`;
}

function RecurringContent() {
  const router = useRouter();
  const { t } = useI18n();
  const list = useApi(() => api.recurringOrders(), []);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      list.silentReload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const replace = (row: RecurringOrderRow) => list.setData((prev) => (prev ? prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : prev));

  const toggleActive = async (r: RecurringOrderRow) => {
    setBusy(r.id);
    try {
      replace(await api.updateRecurring(r.id, { active: !r.active }));
    } catch (err) {
      Alert.alert(t("recurringOrders"), getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const runNow = (r: RecurringOrderRow) => {
    Alert.alert(t("runNow"), t("runNowConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirm"),
        onPress: async () => {
          setBusy(r.id);
          try {
            const res = await api.runRecurringNow(r.id);
            replace(res.recurringOrder);
            const skipped = res.skipped.length;
            Alert.alert(
              t("runNow"),
              `${res.orders.length} ${t("ordersPlaced")} · ${formatSar(res.total)}${skipped ? `\n${skipped} ${t("itemsSkipped")}` : ""}`,
              [{ text: t("done"), style: "cancel" }, ...(res.orders.length ? [{ text: t("viewOrder"), onPress: () => router.push(`/order/${res.orders[0].id}`) }] : [])],
            );
          } catch (err) {
            Alert.alert(t("runNow"), getErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const remove = (r: RecurringOrderRow) => {
    Alert.alert(t("deleteRecurring"), t("deleteRecurringConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          setBusy(r.id);
          try {
            await api.deleteRecurring(r.id);
            list.setData((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev));
          } catch (err) {
            Alert.alert(t("deleteRecurring"), getErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  if (list.loading && !list.data) return <LoadingView />;
  if (list.error && !list.data) return <ErrorView message={list.error} onRetry={list.reload} />;
  const data = list.data ?? [];

  return (
    <Screen scroll refreshing={list.refreshing} onRefresh={list.refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("recurringOrders") }} />
      <Button title={t("newRecurring")} icon="add" variant="secondary" fullWidth onPress={() => router.push("/recurring/new")} style={{ marginTop: spacing.lg, marginBottom: spacing.md }} />
      {data.length === 0 ? (
        <EmptyState icon="calendar-outline" title={t("noRecurring")} message={t("noRecurringHint")} actionTitle={t("buyAgain")} onAction={() => router.push("/buy-again")} />
      ) : (
        data.map((r) => {
          const isBusy = busy === r.id;
          return (
            <Card key={r.id}>
              <View style={styles.head}>
                <View style={[styles.icon, !r.active && { backgroundColor: colors.neutralLight }]}>
                  <Ionicons name={r.active ? "calendar" : "pause"} size={18} color={r.active ? colors.primary : colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={typography.caption}>
                    {t("interval")} {intervalLabel(r.intervalDays, t)} · {r.items.length} {r.items.length === 1 ? t("item") : t("items")}
                  </Text>
                </View>
                <View style={[styles.pill, { backgroundColor: r.active ? colors.successLight : colors.neutralLight }]}>
                  <Text style={[styles.pillText, { color: r.active ? colors.success : colors.textSecondary }]}>{r.active ? t("active") : t("paused")}</Text>
                </View>
              </View>
              <Text style={styles.lines} numberOfLines={2}>
                {r.items.map((it) => `${it.quantity} × ${it.name ?? it.listingId}`).join(", ")}
              </Text>
              <View style={styles.meta}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.caption}>{t("nextRun")}</Text>
                  <Text style={styles.metaValue}>{r.active ? formatDate(r.nextRunAt) : "—"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.caption}>{t("lastRun")}</Text>
                  {r.lastOrder ? (
                    <Pressable onPress={() => router.push(`/order/${r.lastOrder?.id}`)} hitSlop={4}>
                      <Text style={[styles.metaValue, { color: colors.primary }]}>{r.lastOrder.reference}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.metaValue}>{r.lastRunAt ? formatDate(r.lastRunAt) : "—"}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.caption}>{t("paymentMethod")}</Text>
                  <Text style={styles.metaValue}>{r.paymentMethod === "COD" ? t("cod") : r.paymentMethod === "CREDIT" ? t("creditTerms") : t("bankTransfer")}</Text>
                </View>
              </View>
              <Text style={typography.caption} numberOfLines={1}>
                {r.deliveryCity} · {r.deliveryAddress}
              </Text>
              <View style={styles.actions}>
                <Button title={r.active ? t("pause") : t("resume")} size="sm" variant="outline" icon={r.active ? "pause-outline" : "play-outline"} loading={isBusy} onPress={() => void toggleActive(r)} />
                <Button title={t("runNow")} size="sm" icon="flash-outline" disabled={isBusy} onPress={() => runNow(r)} />
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => remove(r)} disabled={isBusy} hitSlop={8} style={styles.trash} accessibilityLabel={t("deleteRecurring")}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

export default function RecurringScreen() {
  return (
    <RequireAuth roles={["BUYER"]}>
      <RecurringContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  name: { ...typography.body, fontWeight: "700" },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: "700" },
  lines: { ...typography.bodySmall, color: colors.text, marginTop: spacing.sm },
  meta: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginBottom: spacing.xs },
  metaValue: { ...typography.body, fontWeight: "600", fontSize: 14 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  trash: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.dangerLight, alignItems: "center", justifyContent: "center" },
});
