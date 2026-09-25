import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ReturnStatus } from "@mysupplier/shared";
import { Screen, Button, Card, SectionHeader, KeyValue, ErrorView, LoadingView, RequireAuth, StatusBadge } from "@/components";
import { RETURN_REASON_KEYS } from "@/components/ReturnSheet";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

const STEPS: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED"];

function ReturnDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const ret = useApi(() => api.returnDetail(id), [id], Boolean(id));
  const [busy, setBusy] = useState(false);

  if (ret.loading && !ret.data) return <LoadingView />;
  if (ret.error || !ret.data) return <ErrorView message={ret.error ?? "Return not found"} onRetry={ret.reload} />;
  const r = ret.data;
  const reasonKey = RETURN_REASON_KEYS[r.reason as keyof typeof RETURN_REASON_KEYS];
  const canCancel = r.status === "REQUESTED" || r.status === "APPROVED";
  const closed = r.status === "REJECTED" || r.status === "CANCELLED";
  const stepIdx = STEPS.indexOf(r.status);
  const itemsTotal = r.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);

  const cancel = () => {
    Alert.alert(t("cancelReturn"), t("cancelReturnConfirm"), [
      { text: t("back"), style: "cancel" },
      {
        text: t("confirm"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await api.cancelReturn(r.id);
            ret.setData((prev) => (prev ? { ...prev, ...updated } : prev));
          } catch (err) {
            Alert.alert(t("cancelReturn"), getErrorMessage(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen scroll refreshing={ret.refreshing} onRefresh={ret.refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: r.reference }} />
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>{t("returnReference")}</Text>
          <Text style={styles.heroTitle}>{reasonKey ? t(reasonKey) : r.reason}</Text>
          <Text style={styles.heroSub}>
            {r.company?.name ?? ""}
            {r.order?.reference ? ` · ${r.order.reference}` : ""}
          </Text>
        </View>
        <StatusBadge status={r.status} />
      </View>

      {!closed ? (
        <Card>
          <View style={styles.steps}>
            {STEPS.map((s, i) => {
              const done = i <= stepIdx;
              return (
                <View key={s} style={styles.step}>
                  <View style={[styles.dot, done && styles.dotDone]}>{done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}</View>
                  <Text style={[styles.stepLabel, done && { color: colors.text, fontWeight: "600" }]} numberOfLines={1}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <SectionHeader title={`${t("items")} (${r.items.length})`} />
      <Card style={{ paddingVertical: spacing.xs }}>
        {r.items.map((it, i) => (
          <View key={it.orderItemId} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{it.name}</Text>
              <Text style={typography.caption}>
                {it.quantity} {it.unit} × {formatSar(it.unitPrice)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatSar(it.unitPrice * it.quantity)}</Text>
          </View>
        ))}
        <View style={styles.summary}>
          <KeyValue label={t("subtotal")} value={formatSar(itemsTotal)} />
          {r.refundAmount !== null && r.refundAmount !== undefined ? (
            <KeyValue label={t("refundAmount")} value={formatSar(r.refundAmount)} />
          ) : r.estimatedRefund !== null && r.estimatedRefund !== undefined ? (
            <KeyValue label={t("estimatedRefund")} value={`~${formatSar(r.estimatedRefund)}`} />
          ) : null}
        </View>
      </Card>

      <SectionHeader title={t("returnDetails")} />
      <Card>
        <KeyValue label={t("returnReason")} value={reasonKey ? t(reasonKey) : r.reason} />
        {r.details ? <Text style={[typography.bodySmall, { color: colors.text, marginVertical: spacing.xs }]}>{r.details}</Text> : null}
        {r.resolution ? (
          <View style={styles.resolution}>
            <Text style={styles.resolutionTitle}>{t("resolution")}</Text>
            <Text style={typography.bodySmall}>{r.resolution}</Text>
          </View>
        ) : null}
        <KeyValue label="Created" value={formatDateTime(r.createdAt)} />
        <KeyValue label="Last update" value={formatDateTime(r.updatedAt)} />
      </Card>

      {canCancel ? <Button title={t("cancelReturn")} variant="danger" fullWidth loading={busy} onPress={cancel} style={{ marginTop: spacing.md }} /> : null}
      <Button title={t("viewOrder")} variant="ghost" icon="receipt-outline" onPress={() => router.push(`/order/${r.orderId}`)} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

export default function ReturnDetailScreen() {
  return (
    <RequireAuth>
      <ReturnDetailContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.lg },
  heroKicker: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5 },
  heroTitle: { ...typography.h2, marginTop: 2 },
  heroSub: { ...typography.bodySmall, marginTop: 2 },
  steps: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  step: { flex: 1, alignItems: "center", gap: 6 },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.neutralLight, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: colors.primary },
  stepLabel: { ...typography.caption, textAlign: "center" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemName: { ...typography.body, fontWeight: "500" },
  itemTotal: { ...typography.body, fontWeight: "600" },
  summary: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  resolution: { marginVertical: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  resolutionTitle: { ...typography.label, color: colors.primary, marginBottom: 2 },
});
