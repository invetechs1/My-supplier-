import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { OrderExtended, PaymentRecord } from "@mysupplier/shared";
import { Screen, Button, Card, KeyValue, LoadingView, RequireAuth } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { startCardPayment } from "@/lib/payments";
import { colors, spacing, typography } from "@/theme";

type Phase = "verifying" | "paid" | "failed" | "missing";

/**
 * Deep-link target `mysupplier://payment?order=<orderId>&id=<paymentId>&status=…`
 * (the hosted Moyasar page redirects here). Verifies the payment server-side
 * and shows the outcome with links back to the order.
 */
function PaymentResultContent() {
  const router = useRouter();
  const { t } = useI18n();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ order?: string; id?: string; status?: string; message?: string }>();
  const orderId = typeof params.order === "string" ? params.order : undefined;
  const paymentId = typeof params.id === "string" ? params.id : undefined;
  const gatewayStatus = typeof params.status === "string" ? params.status : undefined;

  const [phase, setPhase] = useState<Phase>(orderId ? "verifying" : "missing");
  const [order, setOrder] = useState<OrderExtended | null>(null);
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!orderId) return;
    (async () => {
      setPhase("verifying");
      setError(null);
      try {
        if (!paymentId) throw new Error(params.message || "The payment was cancelled before completion.");
        const res = await api.verifyPayment(orderId, paymentId);
        if (cancelled) return;
        setOrder(res.order);
        setPayment(res.payment);
        setPhase(res.payment.status === "PAID" || res.order.paymentStatus === "PAID" ? "paid" : "failed");
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        // Fall back to the order itself: a webhook may already have marked it paid.
        try {
          const o = await api.order(orderId);
          if (cancelled) return;
          setOrder(o);
          setPhase(o.paymentStatus === "PAID" ? "paid" : "failed");
        } catch {
          if (!cancelled) setPhase("failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, paymentId, params.message]);

  const retry = async () => {
    if (!orderId || !token) return;
    setRetrying(true);
    try {
      const outcome = await startCardPayment(orderId, token);
      if (outcome.kind === "returned") {
        router.replace({ pathname: "/payment", params: { order: outcome.orderId, id: outcome.paymentId ?? "", status: outcome.status ?? "" } });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRetrying(false);
    }
  };

  if (phase === "verifying") {
    return (
      <Screen>
        <Stack.Screen options={{ title: t("paymentVerifying") }} />
        <LoadingView message={t("paymentVerifying")} />
      </Screen>
    );
  }

  const paid = phase === "paid";
  const title = phase === "missing" ? "No payment to verify" : paid ? t("paymentSuccess") : t("paymentFailed");

  return (
    <Screen scroll edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: paid ? t("paid") : "Payment", headerBackVisible: false }} />
      <View style={styles.hero}>
        <View style={[styles.icon, { backgroundColor: paid ? colors.success : colors.danger }]}>
          <Ionicons name={paid ? "checkmark" : "close"} size={36} color="#fff" />
        </View>
        <Text style={styles.title}>{title}</Text>
        {order ? (
          <Text style={styles.sub}>
            {order.reference} · {formatSar(order.total)}
          </Text>
        ) : null}
        {!paid && (error || gatewayStatus) ? (
          <Text style={[typography.caption, { textAlign: "center", marginTop: spacing.sm, color: colors.danger }]}>
            {error ?? `Gateway status: ${gatewayStatus}`}
          </Text>
        ) : null}
      </View>

      {order || payment ? (
        <Card>
          {order ? <KeyValue label="Order" value={order.reference} /> : null}
          {order?.company?.name ? <KeyValue label="Supplier" value={order.company.name} /> : null}
          {payment ? <KeyValue label="Payment" value={payment.providerPaymentId ?? payment.id} /> : null}
          {payment ? <KeyValue label="Status" value={payment.status} /> : null}
          {order ? <KeyValue label="Amount" value={formatSar(order.total)} /> : null}
        </Card>
      ) : null}

      {orderId ? (
        <Button title={t("viewOrder")} size="lg" fullWidth icon="cube-outline" onPress={() => router.replace(`/order/${orderId}`)} />
      ) : null}
      {!paid && orderId && phase !== "missing" ? (
        <Button title="Try again" variant="outline" fullWidth loading={retrying} onPress={retry} style={{ marginTop: spacing.sm }} />
      ) : null}
      <Button title={t("orders")} variant="ghost" onPress={() => router.replace("/(tabs)/orders")} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

export default function PaymentResultScreen() {
  return (
    <RequireAuth message="Log in to finish verifying your payment.">
      <PaymentResultContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: spacing.xxl },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h1, marginTop: spacing.lg, textAlign: "center" },
  sub: { ...typography.bodySmall, marginTop: spacing.xs },
});
