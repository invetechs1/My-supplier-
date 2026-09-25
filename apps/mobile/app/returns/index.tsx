import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Screen, Card, EmptyState, ErrorView, LoadingView, RequireAuth, StatusBadge } from "@/components";
import { RETURN_REASON_KEYS } from "@/components/ReturnSheet";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, spacing, typography } from "@/theme";

function ReturnsContent() {
  const router = useRouter();
  const { t } = useI18n();
  const returns = useApi(() => api.returns(), []);

  useFocusEffect(
    React.useCallback(() => {
      returns.silentReload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (returns.loading && !returns.data) return <LoadingView />;
  if (returns.error && !returns.data) return <ErrorView message={returns.error} onRetry={returns.reload} />;
  const data = returns.data?.data ?? [];

  return (
    <Screen scroll refreshing={returns.refreshing} onRefresh={returns.refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("returns") }} />
      {data.length === 0 ? (
        <EmptyState icon="return-down-back-outline" title={t("noReturns")} message={t("noReturnsHint")} actionTitle={t("orders")} onAction={() => router.push("/(tabs)/orders")} style={{ marginTop: spacing.xxl }} />
      ) : (
        <View style={{ paddingTop: spacing.lg }}>
          {data.map((r) => {
            const reasonKey = RETURN_REASON_KEYS[r.reason as keyof typeof RETURN_REASON_KEYS];
            const qty = r.items.reduce((s, it) => s + it.quantity, 0);
            return (
              <Card key={r.id} onPress={() => router.push(`/returns/${r.id}`)}>
                <View style={styles.head}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.caption}>
                      {r.reference} · {formatDate(r.createdAt)}
                    </Text>
                    <Text style={styles.title}>{reasonKey ? t(reasonKey) : r.reason}</Text>
                    <Text style={typography.caption} numberOfLines={2}>
                      {r.order?.reference ? `${r.order.reference} · ` : ""}
                      {r.items.length} {r.items.length === 1 ? t("item") : t("items")} · {qty} {t("quantity").toLowerCase()}
                      {r.company?.name ? ` · ${r.company.name}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <StatusBadge status={r.status} small />
                    {r.refundAmount ? <Text style={styles.amount}>{formatSar(r.refundAmount)}</Text> : null}
                  </View>
                </View>
                <View style={styles.footer}>
                  <Text style={styles.link}>{t("viewOrder")}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

export default function ReturnsScreen() {
  return (
    <RequireAuth>
      <ReturnsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { ...typography.h3, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: "700", color: colors.primary },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: spacing.sm },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
});
