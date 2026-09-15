import React, { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { OrderEvent, OrderExtended, OrderMessage, OrderStatus, PaymentConfig, PaymentMethod, Review } from "@mysupplier/shared";
import { Screen, Button, StatusBadge, Card, SectionHeader, KeyValue, LoadingView, ErrorView, RequireAuth, ProductImage, SvgImage, TextField, DeliverySection, statusLabel } from "@/components";
import { api, deliveryNoteUrl, getErrorMessage, invoiceHtmlUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, formatSar } from "@/lib/format";
import { startCardPayment } from "@/lib/payments";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

const STEPS: Array<{ status: OrderStatus; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { status: "PENDING", label: "Order placed", icon: "receipt-outline" },
  { status: "CONFIRMED", label: "Confirmed by supplier", icon: "checkmark-circle-outline" },
  { status: "IN_TRANSIT", label: "In transit", icon: "car-outline" },
  { status: "DELIVERED", label: "Delivered", icon: "home-outline" },
];

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  PENDING: { status: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { status: "IN_TRANSIT", label: "Mark in transit" },
  IN_TRANSIT: { status: "DELIVERED", label: "Mark delivered" },
};

function orderType(order: OrderExtended): "DIRECT" | "RFQ" {
  return order.type ?? (order.rfqId ? "RFQ" : "DIRECT");
}

function paymentMethodLabel(method: PaymentMethod | null | undefined, t: (k: "cod" | "bankTransfer" | "card") => string): string {
  if (method === "COD") return t("cod");
  if (method === "BANK_TRANSFER") return t("bankTransfer");
  if (method === "CARD") return t("card");
  return "—";
}

const EVENT_ICON: Record<OrderEvent["type"], keyof typeof Ionicons.glyphMap> = {
  CREATED: "receipt-outline",
  STATUS: "sync-outline",
  PAYMENT: "cash-outline",
  NOTE: "create-outline",
  MESSAGE: "chatbubble-outline",
  REVIEW: "star-outline",
};

function eventTitle(e: OrderEvent): string {
  if (e.type === "STATUS" && e.status) return `Status → ${statusLabel(e.status)}`;
  if (e.type === "CREATED") return "Order placed";
  if (e.type === "PAYMENT") return e.message ? `Payment · ${e.message}` : "Payment update";
  if (e.type === "MESSAGE") return "New message";
  if (e.type === "REVIEW") return "Review left";
  return e.message || "Note";
}

/** Order activity timeline (GET /orders/:id/events). */
function ActivitySection({ orderId, version, t }: { orderId: string; version: string; t: (k: "activity") => string }) {
  const events = useApi(() => api.orderEvents(orderId), [orderId, version], Boolean(orderId));
  return (
    <>
      <SectionHeader title={t("activity")} />
      <Card style={{ paddingVertical: spacing.xs }}>
        {events.data?.length ? (
          [...events.data]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((e, i, arr) => (
              <View key={e.id} style={styles.event}>
                <View style={styles.eventIndicator}>
                  <View style={styles.eventDot}>
                    <Ionicons name={EVENT_ICON[e.type] ?? "ellipse-outline"} size={13} color={colors.primary} />
                  </View>
                  {i < arr.length - 1 ? <View style={styles.eventLine} /> : null}
                </View>
                <View style={styles.eventBody}>
                  <Text style={styles.eventTitle}>{eventTitle(e)}</Text>
                  {e.message && e.type !== "NOTE" && e.type !== "PAYMENT" ? (
                    <Text style={typography.bodySmall} numberOfLines={3}>
                      {e.message}
                    </Text>
                  ) : null}
                  <Text style={typography.caption}>
                    {formatDateTime(e.createdAt)}
                    {e.user?.name ? ` · ${e.user.name}` : ""}
                  </Text>
                </View>
              </View>
            ))
        ) : events.loading ? (
          <Text style={[typography.bodySmall, { paddingVertical: spacing.sm }]}>Loading activity…</Text>
        ) : (
          <Text style={[typography.bodySmall, { paddingVertical: spacing.sm }]}>{events.error ?? "No activity recorded yet."}</Text>
        )}
      </Card>
    </>
  );
}

/** Buyer <-> supplier thread; polls every 20 s while the screen is mounted. */
function MessagesSection({ orderId, meId, canPost, t }: { orderId: string; meId?: string; canPost: boolean; t: (k: "messages" | "sendMessage" | "writeMessage") => string }) {
  const thread = useApi(() => api.orderMessages(orderId), [orderId], Boolean(orderId));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { silentReload, setData } = thread;

  useEffect(() => {
    if (!orderId) return;
    const timer = setInterval(() => {
      silentReload();
    }, 20_000);
    return () => clearInterval(timer);
  }, [orderId, silentReload]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const msg = await api.sendOrderMessage(orderId, body);
      setData((prev) => [...(prev ?? []).filter((m) => m.id !== msg.id), msg]);
      setDraft("");
    } catch (err) {
      Alert.alert("Could not send", getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }, [draft, orderId, setData]);

  const messages: OrderMessage[] = [...(thread.data ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <>
      <SectionHeader title={t("messages")} actionTitle={thread.refreshing ? "Refreshing…" : "Refresh"} onAction={() => thread.refresh()} />
      <Card>
        {messages.length ? (
          messages.map((m) => {
            const mine = m.sender?.id === meId;
            return (
              <View key={m.id} style={[styles.bubbleRow, mine && { justifyContent: "flex-end" }]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine ? (
                    <Text style={styles.bubbleSender}>
                      {m.sender?.name ?? "—"}
                      {m.sender?.role ? ` · ${m.sender.role.toLowerCase()}` : ""}
                    </Text>
                  ) : null}
                  <Text style={[typography.body, mine && { color: "#fff" }]}>{m.body}</Text>
                  <Text style={[typography.caption, { marginTop: 4 }, mine && { color: "rgba(255,255,255,0.75)" }]}>
                    {formatDateTime(m.createdAt)}
                    {mine ? (m.readAt ? " · Read" : " · Sent") : ""}
                  </Text>
                </View>
              </View>
            );
          })
        ) : thread.loading ? (
          <Text style={typography.bodySmall}>Loading messages…</Text>
        ) : (
          <Text style={typography.bodySmall}>{thread.error ?? "No messages yet. Questions about delivery, quantities or payment go here."}</Text>
        )}
        {canPost ? (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("writeMessage")}
              placeholderTextColor={colors.textMuted}
              style={styles.composerInput}
              multiline
              maxLength={2000}
            />
            <Pressable onPress={send} disabled={sending || !draft.trim()} style={[styles.sendBtn, (sending || !draft.trim()) && { opacity: 0.5 }]} accessibilityLabel={t("sendMessage")}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </Card>
    </>
  );
}

function Stars({ value, onChange, size = 28 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange?.(n)} disabled={!onChange} hitSlop={4}>
          <Ionicons name={n <= value ? "star" : "star-outline"} size={size} color={colors.accent} />
        </Pressable>
      ))}
    </View>
  );
}

/** Finds the review for this order (embedded on the order when the API sends it, else via the supplier's public reviews). */
async function loadOrderReview(order: OrderExtended): Promise<Review | null> {
  const embedded = (order as OrderExtended & { review?: Review | null }).review;
  if (embedded) return embedded;
  if (!order.companyId) return null;
  for (let page = 1; page <= 3; page += 1) {
    const res = await api.supplierReviews(order.companyId, page);
    const found = res.data.find((r) => r.orderId === order.id);
    if (found) return found;
    if (res.data.length < res.pageSize || page * res.pageSize >= res.total) break;
  }
  return null;
}

function ReviewSection({ order, isBuyer, isOrderSupplier, t }: { order: OrderExtended; isBuyer: boolean; isOrderSupplier: boolean; t: (k: "rateSupplier" | "reply") => string }) {
  const review = useApi(() => loadOrderReview(order), [order.id, order.status], order.status === "DELIVERED");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const { setData } = review;

  if (order.status !== "DELIVERED") return null;

  const submitReview = async () => {
    if (rating < 1) {
      Alert.alert("Pick a rating", "Tap the stars to rate this supplier from 1 to 5.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.createReview(order.id, { rating, comment: comment.trim() || undefined });
      setData(created);
      setComment("");
    } catch (err) {
      Alert.alert("Could not submit review", getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async () => {
    if (!review.data || !reply.trim()) return;
    setBusy(true);
    try {
      const updated = await api.replyReview(review.data.id, reply.trim());
      setData(updated);
      setReply("");
    } catch (err) {
      Alert.alert("Could not send reply", getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const r = review.data;
  if (!r && !isBuyer && !review.loading) return null;

  return (
    <>
      <SectionHeader title={r ? "Review" : t("rateSupplier")} />
      <Card>
        {review.loading && !r ? (
          <Text style={typography.bodySmall}>Checking for a review…</Text>
        ) : r ? (
          <>
            <View style={styles.reviewHead}>
              <Stars value={r.rating} size={18} />
              <Text style={typography.caption}>{formatDate(r.createdAt)}</Text>
            </View>
            <Text style={[typography.caption, { marginTop: 2 }]}>{r.buyer?.company?.name ?? r.buyer?.name ?? "Buyer"}</Text>
            {r.comment ? <Text style={[typography.body, { marginTop: spacing.sm }]}>{r.comment}</Text> : <Text style={[typography.bodySmall, { marginTop: spacing.sm }]}>No comment left.</Text>}
            {r.reply ? (
              <View style={styles.replyBox}>
                <View style={styles.replyHead}>
                  <Ionicons name="return-down-forward-outline" size={14} color={colors.primary} />
                  <Text style={styles.replyTitle}>Supplier reply{r.repliedAt ? ` · ${formatDate(r.repliedAt)}` : ""}</Text>
                </View>
                <Text style={typography.body}>{r.reply}</Text>
              </View>
            ) : isOrderSupplier ? (
              <View style={{ marginTop: spacing.md }}>
                <TextField label={t("reply")} value={reply} onChangeText={setReply} placeholder="Thank the buyer or address their feedback" multiline maxLength={1000} />
                <Button title={`Send ${t("reply").toLowerCase()}`} loading={busy} disabled={!reply.trim()} onPress={submitReply} fullWidth />
              </View>
            ) : null}
          </>
        ) : isBuyer ? (
          <>
            <Text style={typography.bodySmall}>How was {order.company?.name ?? "this supplier"}? Your rating helps other buyers.</Text>
            <View style={{ alignItems: "center", marginVertical: spacing.md }}>
              <Stars value={rating} onChange={setRating} size={34} />
              <Text style={[typography.caption, { marginTop: 4 }]}>{["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating] || "Tap to rate"}</Text>
            </View>
            <TextField value={comment} onChangeText={setComment} placeholder="Delivery on time? Quality as described? (optional)" multiline maxLength={1000} />
            <Button title="Submit review" icon="star-outline" loading={busy} disabled={rating < 1} onPress={submitReview} fullWidth />
          </>
        ) : null}
      </Card>
    </>
  );
}

/** Refund a PAID order (supplier owner/manager or admin): amount defaults to the order total. */
function RefundSheet({ order, visible, onClose, onRefunded, t }: { order: OrderExtended; visible: boolean; onClose: () => void; onRefunded: (o: OrderExtended) => void; t: (k: "refund") => string }) {
  const [amount, setAmount] = useState(String(order.total));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setAmount(String(order.total));
      setReason("");
      setError(null);
    }
  }, [visible, order.total]);

  const submit = async () => {
    const value = Number(amount.replace(/,/g, "").trim());
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a refund amount greater than 0");
    if (value > order.total + 0.005) return setError(`Amount cannot exceed the order total (${formatSar(order.total)})`);
    if (reason.trim().length < 3) return setError("Give a short reason for the refund");
    setBusy(true);
    setError(null);
    try {
      const full = Math.abs(value - order.total) < 0.005;
      const res = await api.refundOrder(order.id, { amount: full ? undefined : Math.round(value * 100) / 100, reason: reason.trim() });
      onRefunded(res.order);
      onClose();
      Alert.alert(t("refund"), `${formatSar(res.refundedAmount)} refunded${order.paymentMethod === "CARD" && res.payment?.provider !== "MANUAL" ? " through the card gateway" : " (recorded as a manual refund)"}.`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>
              {t("refund")} · {order.reference}
            </Text>
            <Text style={typography.caption}>
              {paymentMethodLabel(order.paymentMethod, (k) => k === "cod" ? "Cash on delivery" : k === "bankTransfer" ? "Bank transfer" : "Card")} · paid {formatSar(order.total)}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ padding: spacing.lg }}>
          <TextField label="Amount (SAR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" hint="Defaults to the full amount paid. Partial refunds are allowed." />
          <TextField label="Reason" value={reason} onChangeText={setReason} placeholder="Damaged goods, short delivery, cancelled by buyer…" multiline maxLength={500} />
          <Text style={[typography.caption, { marginBottom: spacing.md }]}>
            {order.paymentMethod === "CARD" ? "Card payments are refunded through the payment gateway; the buyer sees it in 5–10 business days." : "Cash / bank payments are recorded as a manual refund — transfer the money to the buyer separately."}
          </Text>
          {error ? <Text style={[typography.bodySmall, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text> : null}
          <Button title={`${t("refund")} ${formatSar(Number(amount) || 0)}`} variant="danger" icon="return-down-back-outline" size="lg" fullWidth loading={busy} onPress={submit} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function OrderDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user, isSupplier, token, canManageCompany } = useAuth();
  const { data, loading, error, refreshing, reload, refresh, setData, silentReload } = useApi(() => api.order(id), [id], Boolean(id));
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  // ZATCA simplified invoice (number + QR); available for every order the caller may see.
  const invoice = useApi(() => api.invoice(id), [id, data?.paymentStatus, data?.status], Boolean(id) && Boolean(data));

  useEffect(() => {
    let cancelled = false;
    api
      .paymentConfig()
      .then((cfg) => {
        if (!cancelled) setPaymentConfig(cfg);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen>
        <ErrorView message={error ?? "Order not found"} onRetry={reload} />
      </Screen>
    );
  }

  const order = data;
  const type = orderType(order);
  const cancelled = order.status === "CANCELLED";
  const currentIdx = STEPS.findIndex((s) => s.status === order.status);
  const isBuyer = user?.id === order.buyerId;
  const isAdmin = user?.role === "ADMIN";
  const isOrderSupplier = isSupplier && user?.companyId === order.companyId;
  const canRefund = (isOrderSupplier && canManageCompany) || isAdmin;
  const items = order.items ?? [];
  const bidItems = order.bid?.items ?? [];
  const hasBreakdown = typeof order.subtotal === "number";
  const paymentStatus = order.paymentStatus ?? "UNPAID";
  const title = order.rfq?.title ?? (items.length ? `${items[0].name}${items.length > 1 ? ` +${items.length - 1} more` : ""}` : "Order");

  const changeStatus = (status: OrderStatus, confirmText: string) => {
    Alert.alert("Update order", confirmText, [
      { text: "Back", style: "cancel" },
      {
        text: "Confirm",
        style: status === "CANCELLED" ? "destructive" : "default",
        onPress: async () => {
          setBusy(true);
          try {
            const updated = await api.updateOrderStatus(order.id, status);
            setData(updated);
          } catch (err) {
            Alert.alert("Error", getErrorMessage(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const markPaid = () => {
    Alert.alert(t("markAsPaid"), `Confirm that payment of ${formatSar(order.total)} was received for ${order.reference}?`, [
      { text: "Back", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          setPayBusy(true);
          try {
            const updated = await api.updateOrderPayment(order.id, "PAID");
            setData(updated);
          } catch (err) {
            Alert.alert("Error", getErrorMessage(err));
          } finally {
            setPayBusy(false);
          }
        },
      },
    ]);
  };

  const next = NEXT[order.status];
  const cardEnabled = Boolean(paymentConfig?.cardPaymentsEnabled);

  const payByCard = async () => {
    if (!token) return;
    setCardBusy(true);
    setCardError(null);
    try {
      const outcome = await startCardPayment(order.id, token);
      if (outcome.kind === "returned") {
        router.push({ pathname: "/payment", params: { order: outcome.orderId, id: outcome.paymentId ?? "", status: outcome.status ?? "" } });
      }
      // The gateway webhook may have landed already; refresh quietly either way.
      api.order(order.id).then(setData).catch(() => undefined);
    } catch (err) {
      setCardError(getErrorMessage(err));
    } finally {
      setCardBusy(false);
    }
  };

  const openInvoice = () => {
    if (!token) return;
    WebBrowser.openBrowserAsync(invoiceHtmlUrl(order.id, token)).catch(() => undefined);
  };

  const openDeliveryNote = () => {
    if (!token) return;
    WebBrowser.openBrowserAsync(deliveryNoteUrl(order.id, token)).catch(() => undefined);
  };

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: order.reference }} />
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.refRow}>
            <Text style={typography.caption}>{order.reference}</Text>
            <StatusBadge status={type} small />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      <Card style={{ backgroundColor: colors.primary }}>
        <Text style={styles.totalLabel}>Order total</Text>
        <Text style={styles.total}>{formatSar(order.total)}</Text>
        <Text style={styles.totalSub}>
          {order.company?.name ?? "Supplier"} · placed {formatDate(order.createdAt)}
        </Text>
        {hasBreakdown ? (
          <View style={styles.breakdown}>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>{t("subtotal")}</Text>
              <Text style={styles.breakdownValue}>{formatSar(order.subtotal)}</Text>
            </View>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>VAT</Text>
              <Text style={styles.breakdownValue}>{formatSar(order.vat)}</Text>
            </View>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>{t("deliveryFee")}</Text>
              <Text style={styles.breakdownValue}>{formatSar(order.deliveryFee)}</Text>
            </View>
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Status" />
      <Card>
        {cancelled ? (
          <View style={styles.cancelled}>
            <Ionicons name="close-circle" size={22} color={colors.danger} />
            <Text style={[typography.body, { color: colors.danger, fontWeight: "600" }]}>Order cancelled</Text>
          </View>
        ) : null}
        {STEPS.map((step, i) => {
          const done = !cancelled && i <= currentIdx;
          const active = !cancelled && i === currentIdx;
          const isLast = i === STEPS.length - 1;
          return (
            <View key={step.status} style={styles.step}>
              <View style={styles.stepIndicator}>
                <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                  <Ionicons name={step.icon} size={14} color={done ? "#fff" : colors.textMuted} />
                </View>
                {!isLast ? <View style={[styles.line, done && i < currentIdx && styles.lineDone]} /> : null}
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepLabel, done && { color: colors.text }, active && { color: colors.primary }]}>{step.label}</Text>
                {active ? <Text style={typography.caption}>Updated {formatDateTime(order.updatedAt)}</Text> : null}
              </View>
            </View>
          );
        })}
      </Card>

      {isOrderSupplier && next && !cancelled ? (
        <Button
          title={next.label}
          size="lg"
          fullWidth
          loading={busy}
          onPress={() => changeStatus(next.status, `Set this order to "${next.label.replace(/^Mark |^Confirm /, "")}"?`)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
      {(isOrderSupplier || isAdmin) && !cancelled ? (
        <Button title={t("deliveryNote")} variant="outline" icon="clipboard-outline" fullWidth onPress={openDeliveryNote} style={{ marginTop: spacing.md }} />
      ) : null}
      {isBuyer && order.status === "PENDING" ? (
        <Button
          title="Cancel order"
          variant="danger"
          fullWidth
          loading={busy}
          onPress={() => changeStatus("CANCELLED", "Cancel this order? The supplier will be notified.")}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <DeliverySection
        orderId={order.id}
        version={`${order.status}:${order.updatedAt}`}
        canManage={isOrderSupplier && !cancelled}
        onOrderChanged={silentReload}
        t={t}
      />

      <SectionHeader title="Payment" />
      <Card>
        <View style={styles.paymentRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentMethod}>{paymentMethodLabel(order.paymentMethod, t)}</Text>
            <Text style={typography.caption}>
              {paymentStatus === "PAID" ? "Payment received" : paymentStatus === "REFUNDED" ? "Payment refunded" : type === "DIRECT" ? "Payment due on delivery / per supplier terms" : "Settled per bid terms"}
            </Text>
          </View>
          <StatusBadge status={paymentStatus} />
        </View>
        {isBuyer && order.paymentMethod === "CARD" && paymentStatus === "UNPAID" && !cancelled ? (
          <>
            <Button
              title={`${t("payNow")} · ${formatSar(order.total)}`}
              icon="card-outline"
              fullWidth
              loading={cardBusy}
              disabled={paymentConfig !== null && !cardEnabled}
              onPress={payByCard}
              style={{ marginTop: spacing.md }}
            />
            <Text style={[typography.caption, { marginTop: spacing.sm, textAlign: "center" }]}>
              {paymentConfig !== null && !cardEnabled ? t("cardUnavailable") : t("cardOnlineHint")}
            </Text>
            {cardError ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs, textAlign: "center" }]}>{cardError}</Text> : null}
          </>
        ) : null}
        {order.paymentMethod === "BANK_TRANSFER" && paymentStatus === "UNPAID" && !cancelled ? (
          <View style={styles.bankBox}>
            <View style={styles.bankHead}>
              <Ionicons name="business-outline" size={16} color={colors.primary} />
              <Text style={styles.bankTitle}>{t("bankTransferInstructions")}</Text>
            </View>
            <KeyValue label="Beneficiary" value={order.company?.name ?? "Supplier"} />
            <KeyValue label="Amount" value={formatSar(order.total)} />
            <KeyValue label="Transfer reference" value={order.reference} />
            <Text style={[typography.caption, { marginTop: spacing.sm }]}>
              Transfer the amount to the supplier's bank account (IBAN shared on the order confirmation / invoice) and quote the reference above so the supplier can match it. The supplier marks the order as paid once funds arrive.
            </Text>
          </View>
        ) : null}
        {(isOrderSupplier || isAdmin) && paymentStatus === "UNPAID" && !cancelled ? (
          <Button title={t("markAsPaid")} variant="secondary" icon="cash-outline" fullWidth loading={payBusy} onPress={markPaid} style={{ marginTop: spacing.md }} />
        ) : null}
        {paymentStatus === "REFUNDED" ? (
          <View style={styles.refundedRow}>
            <Ionicons name="return-down-back-outline" size={16} color={colors.textSecondary} />
            <Text style={[typography.bodySmall, { fontWeight: "600" }]}>{t("refunded")}</Text>
            <StatusBadge status="REFUNDED" small />
          </View>
        ) : null}
        {canRefund && paymentStatus === "PAID" ? (
          <Button title={t("refund")} variant="outline" icon="return-down-back-outline" fullWidth onPress={() => setRefundOpen(true)} style={{ marginTop: spacing.md }} />
        ) : null}
      </Card>
      {canRefund ? <RefundSheet order={order} visible={refundOpen} onClose={() => setRefundOpen(false)} onRefunded={(o) => setData(o)} t={t} /> : null}

      <SectionHeader title={t("invoice")} />
      <Card>
        <View style={styles.invoiceRow}>
          <View style={{ flex: 1 }}>
            {invoice.data ? (
              <>
                <Text style={typography.caption}>{t("invoiceNumber")}</Text>
                <Text style={styles.invoiceNumber}>{invoice.data.invoiceNumber}</Text>
                <Text style={typography.caption}>Issued {formatDate(invoice.data.issuedAt)}</Text>
                {invoice.data.seller.vatNumber ? <Text style={typography.caption}>Seller VAT {invoice.data.seller.vatNumber}</Text> : null}
              </>
            ) : invoice.loading ? (
              <Text style={typography.bodySmall}>Preparing invoice…</Text>
            ) : (
              <Text style={typography.bodySmall}>{invoice.error ? "Invoice not available yet" : "Simplified tax invoice (ZATCA phase 1)"}</Text>
            )}
          </View>
          {invoice.data?.qrSvg ? (
            <View style={styles.qrWrap}>
              <SvgImage xml={invoice.data.qrSvg} width={96} height={96} accessibilityLabel="ZATCA invoice QR code" />
            </View>
          ) : null}
        </View>
        <Button title={t("viewInvoice")} variant="outline" icon="document-text-outline" fullWidth onPress={openInvoice} style={{ marginTop: spacing.md }} />
      </Card>

      <SectionHeader title={t("deliveryDetails")} />
      <Card>
        <KeyValue label="Supplier" value={order.company?.name ?? "—"} />
        {order.company?.city ? <KeyValue label="Supplier city" value={order.company.city} /> : null}
        {order.company?.phone ? <KeyValue label="Supplier phone" value={order.company.phone} /> : null}
        {isOrderSupplier || isAdmin ? <KeyValue label="Buyer" value={order.rfq?.buyer?.company?.name ?? order.rfq?.buyer?.name ?? "Buyer"} /> : null}
        <KeyValue label="Delivery city" value={order.deliveryCity ?? order.rfq?.deliveryCity ?? "—"} />
        {order.deliveryAddress ?? order.rfq?.deliveryAddress ? <KeyValue label="Address" value={order.deliveryAddress ?? order.rfq?.deliveryAddress ?? ""} /> : null}
        {order.contactPhone ? <KeyValue label="Contact phone" value={order.contactPhone} /> : null}
        {order.rfq?.deliveryDate ? <KeyValue label="Requested delivery" value={formatDate(order.rfq.deliveryDate)} /> : null}
        {order.bid ? <KeyValue label="Delivery lead" value={`${order.bid.deliveryDays} days`} /> : null}
        {order.notes ? <KeyValue label={t("notes")} value={order.notes} /> : null}
        <KeyValue label="Last update" value={formatDateTime(order.updatedAt)} />
      </Card>

      {items.length ? (
        <>
          <SectionHeader title={`Items (${items.length})`} />
          <Card style={{ paddingVertical: spacing.xs }}>
            {items.map((it, i) => {
              const content = (
                <View style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                  {it.material ? <ProductImage material={it.material} size={44} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {it.name || it.material?.name || "Item"}
                    </Text>
                    <Text style={typography.caption}>
                      {it.quantity} {it.unit} × {formatSar(it.unitPrice)}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatSar(it.lineTotal)}</Text>
                </View>
              );
              return it.materialId ? (
                <Pressable key={it.id} onPress={() => router.push(`/shop/product/${it.materialId}`)}>
                  {content}
                </Pressable>
              ) : (
                <View key={it.id}>{content}</View>
              );
            })}
            {hasBreakdown ? (
              <View style={styles.itemsSummary}>
                <KeyValue label={t("subtotal")} value={formatSar(order.subtotal)} />
                <KeyValue label={t("vat")} value={formatSar(order.vat)} />
                <KeyValue label={t("deliveryFee")} value={formatSar(order.deliveryFee)} />
                <View style={styles.itemsTotalRow}>
                  <Text style={styles.itemsTotalLabel}>{t("total")}</Text>
                  <Text style={styles.itemsTotalValue}>{formatSar(order.total)}</Text>
                </View>
              </View>
            ) : null}
          </Card>
        </>
      ) : bidItems.length ? (
        <>
          <SectionHeader title="Items" />
          <Card style={{ paddingVertical: spacing.xs }}>
            {bidItems.map((bi, i) => {
              const rfqItem = order.rfq?.items.find((ri) => ri.id === bi.rfqItemId);
              return (
                <View key={bi.id} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemDesc}>{rfqItem?.description ?? "Item"}</Text>
                    <Text style={typography.caption}>
                      {bi.quantity} {rfqItem?.unit ?? ""} × {formatSar(bi.unitPrice)}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatSar(bi.quantity * bi.unitPrice)}</Text>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      <ReviewSection order={order} isBuyer={isBuyer} isOrderSupplier={isOrderSupplier} t={t} />

      <MessagesSection orderId={order.id} meId={user?.id} canPost={(isBuyer || isOrderSupplier || isAdmin) && !cancelled} t={t} />

      <ActivitySection orderId={order.id} version={`${order.status}:${paymentStatus}:${order.updatedAt}`} t={t} />

      {order.rfq || (type === "RFQ" && order.rfqId) ? (
        <Button title="View original RFQ" variant="ghost" onPress={() => router.push(`/rfq/${order.rfqId}`)} style={{ marginTop: spacing.sm }} />
      ) : null}
      {type === "DIRECT" && isBuyer ? (
        <Button title={t("continueShopping")} variant="ghost" icon="storefront-outline" onPress={() => router.push("/(tabs)/shop")} style={{ marginTop: spacing.sm }} />
      ) : null}
    </Screen>
  );
}

export default function OrderDetailScreen() {
  return (
    <RequireAuth>
      <OrderDetailContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.lg },
  refRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.h2, marginTop: 2 },
  totalLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5 },
  total: { fontSize: 28, fontWeight: "800", color: "#fff", marginTop: 4 },
  totalSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  breakdown: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.35)" },
  breakdownCol: { flex: 1 },
  breakdownLabel: { fontSize: 11, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.4 },
  breakdownValue: { fontSize: 14, fontWeight: "700", color: "#fff", marginTop: 2 },
  cancelled: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  step: { flexDirection: "row", gap: spacing.md, minHeight: 52 },
  stepIndicator: { alignItems: "center", width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.neutralLight, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: colors.primary },
  dotActive: { backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.primaryLight },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, paddingTop: 4, paddingBottom: spacing.md },
  stepLabel: { ...typography.body, color: colors.textMuted, fontWeight: "500" },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  paymentMethod: { ...typography.body, fontWeight: "600" },
  bankBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  bankHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  bankTitle: { ...typography.label, color: colors.primary },
  invoiceRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  invoiceNumber: { ...typography.h3, marginTop: 2, marginBottom: 2 },
  qrWrap: { width: 104, height: 104, padding: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemDesc: { ...typography.body, fontWeight: "500" },
  itemTotal: { ...typography.body, fontWeight: "600" },
  itemsSummary: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  itemsTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  itemsTotalLabel: { ...typography.h3 },
  itemsTotalValue: { fontSize: 17, fontWeight: "800", color: colors.primary },
  event: { flexDirection: "row", gap: spacing.md, minHeight: 44 },
  eventIndicator: { alignItems: "center", width: 24 },
  eventDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  eventLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  eventBody: { flex: 1, paddingTop: 2, paddingBottom: spacing.md },
  eventTitle: { ...typography.body, fontWeight: "600" },
  bubbleRow: { flexDirection: "row", marginBottom: spacing.sm },
  bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.neutralLight, borderBottomLeftRadius: 4 },
  bubbleSender: { ...typography.caption, fontWeight: "600", marginBottom: 2 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stars: { flexDirection: "row", gap: 4 },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  replyBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  replyHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  replyTitle: { ...typography.label, color: colors.primary },
  refundedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: spacing.sm },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});
