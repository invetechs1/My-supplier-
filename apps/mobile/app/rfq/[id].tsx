import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { Bid, CreateBidPayload, Rfq, RfqItem } from "@mysupplier/shared";
import {
  Screen,
  Button,
  TextField,
  PickerField,
  PickerModal,
  StatusBadge,
  Card,
  SectionHeader,
  KeyValue,
  LoadingView,
  ErrorView,
  RequireAuth,
} from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, formatDate, formatDateTime, formatSar, toIsoDateInDays } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

type RfqDetail = Rfq & { bids?: Bid[]; myBid?: Bid | null; myBidId?: string | null };

function RfqHeader({ rfq }: { rfq: RfqDetail }) {
  const closesIn = daysUntil(rfq.closesAt);
  return (
    <>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.caption}>{rfq.reference}</Text>
          <Text style={styles.title}>{rfq.title}</Text>
        </View>
        <StatusBadge status={rfq.status} />
      </View>
      <Card>
        <KeyValue label="Delivery city" value={rfq.deliveryCity} />
        <KeyValue label="Delivery date" value={formatDate(rfq.deliveryDate)} />
        <KeyValue
          label="Closes"
          value={`${formatDateTime(rfq.closesAt)}${closesIn !== null && rfq.status === "OPEN" ? closesIn > 0 ? ` (${closesIn}d left)` : " (expired)" : ""}`}
        />
        {rfq.buyer?.name ? <KeyValue label="Buyer" value={rfq.buyer.company?.name ?? rfq.buyer.name} /> : null}
        <KeyValue label="Bids" value={String(rfq.bidCount ?? rfq.bids?.length ?? 0)} />
        {rfq.notes ? <Text style={styles.notes}>{rfq.notes}</Text> : null}
      </Card>

      <SectionHeader title={`Items (${rfq.items.length})`} />
      <Card style={{ paddingVertical: spacing.xs }}>
        {rfq.items.map((it, i) => (
          <View key={it.id} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemDesc}>{it.description}</Text>
              {it.material?.name && it.material.name !== it.description ? (
                <Text style={typography.caption}>{it.material.name}</Text>
              ) : null}
            </View>
            <Text style={styles.itemQty}>
              {it.quantity} {it.unit}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}

// Buyer view ------------------------------------------------------------------

function BuyerBids({ rfq, onChanged }: { rfq: RfqDetail; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const bids = useMemo(
    () =>
      [...(rfq.bids ?? [])].sort((a, b) => {
        const rank = (s: Bid["status"]) => (s === "ACCEPTED" ? 0 : s === "SUBMITTED" ? 1 : s === "REJECTED" ? 2 : 3);
        return rank(a.status) - rank(b.status) || a.totalPrice - b.totalPrice;
      }),
    [rfq.bids],
  );

  const accept = (bid: Bid) => {
    Alert.alert(
      "Accept bid",
      `Award this RFQ to ${bid.company?.name ?? "this supplier"} for ${formatSar(bid.totalPrice)}? Other bids will be rejected and an order created.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            setBusy(bid.id);
            try {
              const res = await api.acceptBid(bid.id);
              onChanged();
              router.push(`/order/${res.order.id}`);
            } catch (err) {
              Alert.alert("Error", getErrorMessage(err));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const reject = async (bid: Bid) => {
    setBusy(bid.id);
    try {
      await api.rejectBid(bid.id);
      onChanged();
    } catch (err) {
      Alert.alert("Error", getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const rfqAction = (kind: "close" | "cancel") => {
    Alert.alert(
      kind === "close" ? "Close RFQ" : "Cancel RFQ",
      kind === "close" ? "Suppliers will no longer be able to bid." : "This RFQ will be cancelled and all bids discarded.",
      [
        { text: "Back", style: "cancel" },
        {
          text: kind === "close" ? "Close" : "Cancel RFQ",
          style: "destructive",
          onPress: async () => {
            setBusy(kind);
            try {
              if (kind === "close") await api.closeRfq(rfq.id);
              else await api.cancelRfq(rfq.id);
              onChanged();
            } catch (err) {
              Alert.alert("Error", getErrorMessage(err));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const lowest = bids.find((b) => b.status === "SUBMITTED" || b.status === "ACCEPTED")?.totalPrice ?? null;

  return (
    <>
      <SectionHeader title={`Bids (${bids.length})`} />
      {bids.length === 0 ? (
        <Card>
          <Text style={typography.bodySmall}>
            No bids yet. Suppliers in {rfq.deliveryCity} have been notified; check back soon.
          </Text>
        </Card>
      ) : (
        bids.map((bid, i) => {
          const savings = lowest && bid.totalPrice > lowest ? ((bid.totalPrice - lowest) / lowest) * 100 : 0;
          return (
            <Card key={bid.id}>
              <View style={styles.bidTop}>
                <View style={styles.rank}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.supplierRow}>
                    <Text style={styles.supplier} numberOfLines={1}>
                      {bid.company?.name ?? "Supplier"}
                    </Text>
                    {bid.company?.verified ? <Ionicons name="checkmark-circle" size={15} color={colors.primary} /> : null}
                  </View>
                  <Text style={typography.caption}>
                    {bid.company?.city ?? ""}
                    {bid.company?.rating ? ` · ${bid.company.rating.toFixed(1)}★` : ""} · {bid.deliveryDays}d delivery
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.bidTotal}>{formatSar(bid.totalPrice)}</Text>
                  {savings > 0 ? (
                    <Text style={styles.bidDelta}>+{savings.toFixed(1)}% vs lowest</Text>
                  ) : lowest === bid.totalPrice && bid.status !== "REJECTED" ? (
                    <Text style={[styles.bidDelta, { color: colors.success }]}>Lowest</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.bidItems}>
                {bid.items.map((bi) => {
                  const rfqItem = rfq.items.find((ri) => ri.id === bi.rfqItemId);
                  return (
                    <View key={bi.id} style={styles.bidItemRow}>
                      <Text style={styles.bidItemDesc} numberOfLines={1}>
                        {rfqItem?.description ?? "Item"}
                      </Text>
                      <Text style={typography.caption}>
                        {bi.quantity} × {formatSar(bi.unitPrice)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {bid.notes ? <Text style={styles.notes}>{bid.notes}</Text> : null}

              <View style={styles.bidFooter}>
                <StatusBadge status={bid.status} small />
                <Text style={typography.caption}>Valid until {formatDate(bid.validUntil)}</Text>
              </View>

              {rfq.status === "OPEN" && bid.status === "SUBMITTED" ? (
                <View style={styles.bidActions}>
                  <Button title="Reject" variant="outline" size="sm" onPress={() => reject(bid)} loading={busy === bid.id} style={{ flex: 1 }} />
                  <Button title="Accept bid" size="sm" onPress={() => accept(bid)} loading={busy === bid.id} style={{ flex: 2 }} />
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      {rfq.status === "OPEN" ? (
        <View style={styles.rfqActions}>
          <Button title="Close RFQ" variant="secondary" onPress={() => rfqAction("close")} loading={busy === "close"} style={{ flex: 1 }} />
          <Button title="Cancel RFQ" variant="danger" onPress={() => rfqAction("cancel")} loading={busy === "cancel"} style={{ flex: 1 }} />
        </View>
      ) : null}
    </>
  );
}

// Supplier view ---------------------------------------------------------------

const VALID_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

function SupplierBidForm({ rfq, existing, onChanged }: { rfq: RfqDetail; existing: Bid | null; onChanged: () => void }) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [deliveryDays, setDeliveryDays] = useState(existing ? String(existing.deliveryDays) : "7");
  const [validDays, setValidDays] = useState("14");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [validOpen, setValidOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!existing) return;
    const next: Record<string, string> = {};
    existing.items.forEach((bi) => {
      next[bi.rfqItemId] = String(bi.unitPrice);
    });
    setPrices(next);
  }, [existing]);

  const total = useMemo(
    () =>
      rfq.items.reduce((sum, it) => {
        const p = Number(prices[it.id]);
        return sum + (Number.isNaN(p) ? 0 : p * it.quantity);
      }, 0),
    [prices, rfq.items],
  );

  const lineTotal = (it: RfqItem) => {
    const p = Number(prices[it.id]);
    return Number.isNaN(p) || !prices[it.id] ? null : p * it.quantity;
  };

  const submit = async () => {
    const next: Record<string, string> = {};
    rfq.items.forEach((it) => {
      const p = Number(prices[it.id]);
      if (!prices[it.id] || Number.isNaN(p) || p <= 0) next[it.id] = "Enter a unit price";
    });
    const dd = Number(deliveryDays);
    if (!deliveryDays || Number.isNaN(dd) || dd < 0) next.deliveryDays = "Enter delivery days";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const payload: CreateBidPayload = {
      validUntil: toIsoDateInDays(Number(validDays)),
      deliveryDays: dd,
      notes: notes.trim() || undefined,
      items: rfq.items.map((it) => ({
        rfqItemId: it.id,
        unitPrice: Number(prices[it.id]),
        quantity: it.quantity,
        leadTimeDays: dd,
      })),
    };
    try {
      await api.submitBid(rfq.id, payload);
      Alert.alert(existing ? "Bid updated" : "Bid submitted", "The buyer has been notified.");
      onChanged();
    } catch (err) {
      Alert.alert("Could not submit bid", getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = () => {
    if (!existing) return;
    Alert.alert("Withdraw bid", "Your bid will be withdrawn from this RFQ.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: async () => {
          try {
            await api.withdrawBid(existing.id);
            onChanged();
          } catch (err) {
            Alert.alert("Error", getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const closed = rfq.status !== "OPEN" || (daysUntil(rfq.closesAt) ?? 1) <= 0;
  const locked = closed || (existing && existing.status !== "SUBMITTED");

  return (
    <>
      {existing ? (
        <>
          <SectionHeader title="Your bid" />
          <Card>
            <View style={styles.bidTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bidTotal}>{formatSar(existing.totalPrice)}</Text>
                <Text style={typography.caption}>
                  {existing.deliveryDays}d delivery · valid until {formatDate(existing.validUntil)}
                </Text>
              </View>
              <StatusBadge status={existing.status} />
            </View>
            {existing.status === "SUBMITTED" && !closed ? (
              <Button title="Withdraw bid" variant="ghost" size="sm" onPress={withdraw} style={{ alignSelf: "flex-start", marginTop: spacing.sm }} />
            ) : null}
          </Card>
        </>
      ) : null}

      {locked ? (
        <Card style={{ backgroundColor: colors.neutralLight }}>
          <Text style={typography.bodySmall}>
            {closed ? "This RFQ is no longer accepting bids." : "Your bid can no longer be edited."}
          </Text>
        </Card>
      ) : (
        <>
          <SectionHeader title={existing ? "Update your bid" : "Submit a bid"} />
          <Card>
            {rfq.items.map((it) => {
              const lt = lineTotal(it);
              return (
                <View key={it.id} style={styles.priceLine}>
                  <View style={styles.priceLineHead}>
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {it.description}
                    </Text>
                    <Text style={typography.caption}>
                      {it.quantity} {it.unit}
                    </Text>
                  </View>
                  <TextField
                    label={`Unit price (SAR / ${it.unit})`}
                    value={prices[it.id] ?? ""}
                    onChangeText={(v) => setPrices((p) => ({ ...p, [it.id]: v.replace(/[^0-9.]/g, "") }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    error={errors[it.id]}
                    hint={lt !== null ? `Line total ${formatSar(lt)}` : undefined}
                  />
                </View>
              );
            })}
            <View style={styles.row}>
              <TextField
                label="Delivery (days)"
                value={deliveryDays}
                onChangeText={(v) => setDeliveryDays(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                containerStyle={{ flex: 1 }}
                error={errors.deliveryDays}
              />
              <PickerField
                label="Bid valid for"
                value={VALID_OPTIONS.find((o) => o.value === validDays)?.label}
                onPress={() => setValidOpen(true)}
                style={{ flex: 1 }}
              />
            </View>
            <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Brand, payment terms, inclusions..." />

            <View style={styles.totalRow}>
              <Text style={typography.label}>Total bid</Text>
              <Text style={styles.total}>{formatSar(total)}</Text>
            </View>
            <Button title={existing ? "Update bid" : "Submit bid"} size="lg" fullWidth loading={submitting} onPress={submit} />
          </Card>
        </>
      )}

      <PickerModal visible={validOpen} title="Bid valid for" options={VALID_OPTIONS} value={validDays} onSelect={setValidDays} onClose={() => setValidOpen(false)} />
    </>
  );
}

// Screen ----------------------------------------------------------------------

function RfqDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isSupplier } = useAuth();
  const { data, loading, error, refreshing, reload, refresh, silentReload } = useApi(() => api.rfq(id), [id], Boolean(id));

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
        <ErrorView message={error ?? "RFQ not found"} onRetry={reload} />
      </Screen>
    );
  }

  const isOwner = user?.id === data.buyerId || user?.role === "ADMIN";
  // The API returns only the supplier's own bid (if any) under `bids` / `myBid`.
  const myBid: Bid | null =
    data.myBid ??
    (data.bids ?? []).find((b) => b.companyId && b.companyId === user?.companyId) ??
    (isSupplier ? (data.bids?.[0] ?? null) : null);

  return (
    <Screen scroll keyboard refreshing={refreshing} onRefresh={refresh} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: data.reference }} />
      <RfqHeader rfq={data} />
      {isOwner ? (
        <BuyerBids rfq={data} onChanged={silentReload} />
      ) : isSupplier ? (
        <SupplierBidForm rfq={data} existing={myBid} onChanged={silentReload} />
      ) : null}
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

export default function RfqDetailScreen() {
  return (
    <RequireAuth>
      <RfqDetailContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.lg },
  title: { ...typography.h2, marginTop: 2 },
  notes: { ...typography.bodySmall, marginTop: spacing.sm, fontStyle: "italic" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemDesc: { ...typography.body, fontWeight: "500", flex: 1 },
  itemQty: { ...typography.body, fontWeight: "600", color: colors.primary },
  bidTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  rankText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  supplierRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  supplier: { ...typography.body, fontWeight: "600", flexShrink: 1 },
  bidTotal: { fontSize: 18, fontWeight: "700", color: colors.text },
  bidDelta: { ...typography.caption, color: colors.warning, fontWeight: "600" },
  bidItems: { marginTop: spacing.md, backgroundColor: colors.neutralLight, borderRadius: radius.md, padding: spacing.sm },
  bidItemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, gap: spacing.md },
  bidItemDesc: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  bidFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  bidActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  rfqActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  priceLine: { marginBottom: spacing.sm },
  priceLineHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: "row", gap: spacing.md },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  total: { fontSize: 20, fontWeight: "800", color: colors.primary },
});
