import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import type { PriceAlert } from "@mysupplier/shared";
import { Screen, Card, EmptyState, ErrorView, LoadingView, RequireAuth, ProductImage } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { effectivePriceOf } from "@/lib/pricing";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

function AlertsContent() {
  const router = useRouter();
  const { t } = useI18n();
  const alerts = useApi(() => api.alerts(), []);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      alerts.silentReload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const remove = (a: PriceAlert) => {
    Alert.alert(t("deleteAlert"), a.material?.name ?? "", [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          setBusy(a.id);
          try {
            await api.deleteAlert(a.id);
            alerts.setData((prev) => (prev ? prev.filter((x) => x.id !== a.id) : prev));
          } catch (err) {
            Alert.alert(t("deleteAlert"), getErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  if (alerts.loading && !alerts.data) return <LoadingView />;
  if (alerts.error && !alerts.data) return <ErrorView message={alerts.error} onRetry={alerts.reload} />;
  const data = alerts.data ?? [];

  return (
    <Screen scroll refreshing={alerts.refreshing} onRefresh={alerts.refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("priceAlerts") }} />
      {data.length === 0 ? (
        <EmptyState icon="notifications-outline" title={t("noAlerts")} message={t("noAlertsHint")} actionTitle={t("shop")} onAction={() => router.push("/(tabs)/shop")} style={{ marginTop: spacing.xxl }} />
      ) : (
        <View style={{ paddingTop: spacing.lg }}>
          {data.map((a) => {
            const m = a.material;
            const current = effectivePriceOf(m?.bestOffer) ?? m?.minPrice ?? null;
            const reached = a.targetPrice !== null && a.targetPrice !== undefined && current !== null && current <= a.targetPrice;
            return (
              <Card key={a.id} onPress={() => router.push(`/shop/product/${a.materialId}`)} style={styles.card}>
                {m ? <ProductImage material={m} size={56} /> : <View style={styles.placeholder} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>
                    {m?.name ?? a.materialId}
                  </Text>
                  <View style={styles.row}>
                    {a.targetPrice ? (
                      <Text style={typography.caption}>
                        {t("target")} <Text style={{ fontWeight: "700", color: colors.text }}>{formatSar(a.targetPrice)}</Text>
                      </Text>
                    ) : null}
                    {a.notifyBackInStock ? (
                      <View style={styles.tag}>
                        <Ionicons name="cube-outline" size={11} color={colors.info} />
                        <Text style={styles.tagText}>{t("backInStock")}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.row}>
                    {current !== null ? (
                      <Text style={[typography.caption, reached && { color: colors.success, fontWeight: "700" }]}>
                        {t("currentBest")} {formatSar(current)}
                      </Text>
                    ) : null}
                    <View style={[styles.status, { backgroundColor: a.triggeredAt ? colors.successLight : a.active ? colors.primaryLight : colors.neutralLight }]}>
                      <Text style={[styles.statusText, { color: a.triggeredAt ? colors.success : a.active ? colors.primary : colors.textSecondary }]}>
                        {a.triggeredAt ? `${t("triggered")} ${formatDate(a.triggeredAt)}` : a.active ? t("active") : t("paused")}
                      </Text>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => remove(a)} disabled={busy === a.id} hitSlop={8} style={styles.trash} accessibilityLabel={t("deleteAlert")}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

export default function AlertsScreen() {
  return (
    <RequireAuth>
      <AlertsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  placeholder: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.neutralLight },
  name: { ...typography.body, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 3, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.infoLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  tagText: { fontSize: 11, fontWeight: "600", color: colors.info },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  statusText: { fontSize: 11, fontWeight: "600" },
  trash: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.dangerLight, alignItems: "center", justifyContent: "center" },
});
