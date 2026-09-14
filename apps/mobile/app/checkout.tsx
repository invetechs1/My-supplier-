import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SAUDI_CITIES, type CheckoutResult, type PaymentMethod } from "@mysupplier/shared";
import { Screen, Button, Card, KeyValue, TextField, PickerField, PickerModal, EmptyState, LoadingView, RequireAuth, StatusBadge } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

function CheckoutForm() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { items, groups, summary, loading, refresh } = useCart();

  const [city, setCity] = useState<string>(user?.company?.city ?? "");
  const [cityOpen, setCityOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [payment, setPayment] = useState<PaymentMethod>("COD");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ city?: string; address?: string; phone?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  useEffect(() => {
    if (user?.phone && !phone) setPhone(user.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone]);

  const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; hint?: string; icon: "cash-outline" | "business-outline" | "card-outline" }> = [
    { value: "COD", label: t("cod"), icon: "cash-outline" },
    { value: "BANK_TRANSFER", label: t("bankTransfer"), icon: "business-outline" },
    { value: "CARD", label: t("card"), hint: t("cardHint"), icon: "card-outline" },
  ];

  const validate = () => {
    const next: typeof errors = {};
    if (!city) next.city = "Delivery city is required";
    if (address.trim().length < 5) next.address = "Enter a delivery address";
    if (phone.trim().length < 7) next.phone = "Enter a contact phone";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const placeOrder = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.checkout({
        deliveryCity: city,
        deliveryAddress: address.trim(),
        contactPhone: phone.trim(),
        paymentMethod: payment,
        notes: notes.trim() || undefined,
      });
      setResult(res);
      void refresh();
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <Screen scroll edges={["bottom", "left", "right"]}>
        <Stack.Screen options={{ title: t("orderPlaced"), headerBackVisible: false }} />
        <View style={styles.success}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.successTitle}>{t("orderPlaced")}</Text>
          <Text style={styles.successSub}>
            {result.orders.length} order{result.orders.length === 1 ? "" : "s"} · {formatSar(result.total)}
          </Text>
        </View>
        {result.orders.map((o) => (
          <Card key={o.id} onPress={() => router.push(`/order/${o.id}`)}>
            <View style={styles.orderTop}>
              <View style={{ flex: 1 }}>
                <Text style={typography.caption}>{o.reference}</Text>
                <Text style={styles.orderSupplier}>{o.company?.name ?? "Supplier"}</Text>
                <Text style={typography.caption}>
                  {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? "" : "s"} · {o.paymentMethod?.replace("_", " ") ?? payment}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <StatusBadge status={o.status} small />
                <Text style={styles.orderTotal}>{formatSar(o.total)}</Text>
              </View>
            </View>
            <View style={styles.orderLink}>
              <Text style={styles.orderLinkText}>{t("viewOrder")}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </View>
          </Card>
        ))}
        <Button title={t("orders")} icon="cube-outline" size="lg" fullWidth onPress={() => router.replace("/(tabs)/orders")} style={{ marginTop: spacing.md }} />
        <Button title={t("continueShopping")} variant="ghost" onPress={() => router.replace("/(tabs)/shop")} style={{ marginTop: spacing.sm }} />
      </Screen>
    );
  }

  if (loading && items.length === 0) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState icon="cart-outline" title={t("cartEmpty")} message={t("cartEmptyHint")} actionTitle={t("continueShopping")} onAction={() => router.replace("/(tabs)/shop")} />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("checkout") }} />

      <Text style={styles.sectionTitle}>{t("deliveryDetails")}</Text>
      <PickerField label="Delivery city" value={city} placeholder="Select city" onPress={() => setCityOpen(true)} error={errors.city} />
      <TextField
        label="Delivery address"
        value={address}
        onChangeText={setAddress}
        placeholder="Site / warehouse address, district, landmarks"
        multiline
        error={errors.address}
      />
      <TextField
        label="Contact phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="+9665XXXXXXXX"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={errors.phone}
      />

      <Text style={styles.sectionTitle}>{t("paymentMethod")}</Text>
      <View style={styles.segment}>
        {PAYMENT_OPTIONS.map((opt) => {
          const active = payment === opt.value;
          return (
            <Pressable key={opt.value} onPress={() => setPayment(opt.value)} style={[styles.segmentItem, active && styles.segmentItemActive]}>
              <Ionicons name={opt.icon} size={18} color={active ? "#fff" : colors.textSecondary} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={2}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {PAYMENT_OPTIONS.find((o) => o.value === payment)?.hint ? (
        <Text style={[typography.caption, { marginTop: -spacing.sm, marginBottom: spacing.md }]}>{PAYMENT_OPTIONS.find((o) => o.value === payment)?.hint}</Text>
      ) : null}

      <TextField label={t("notes")} value={notes} onChangeText={setNotes} placeholder="Delivery window, crane access, PO number..." multiline />

      <Text style={styles.sectionTitle}>Order summary</Text>
      <Card>
        {groups.map((g) => (
          <View key={g.key} style={styles.groupRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName} numberOfLines={1}>
                {g.supplierName}
              </Text>
              <Text style={typography.caption}>
                {g.items.length} item{g.items.length === 1 ? "" : "s"} · {g.city}
              </Text>
            </View>
            <Text style={styles.groupValue}>{formatSar(g.subtotal)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <KeyValue label={t("subtotal")} value={formatSar(summary.subtotal)} />
        <KeyValue label={t("vat")} value={formatSar(summary.vat)} />
        <KeyValue label={t("deliveryFee")} value={formatSar(summary.deliveryFee)} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t("total")}</Text>
          <Text style={styles.totalValue}>{formatSar(summary.total)}</Text>
        </View>
        <Text style={typography.caption}>
          One order is created per supplier ({groups.length}). Suppliers confirm and arrange delivery.
        </Text>
      </Card>

      {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
      <Button title={`${t("placeOrder")} · ${formatSar(summary.total)}`} size="lg" fullWidth loading={submitting} onPress={placeOrder} />

      <PickerModal visible={cityOpen} title="Delivery city" options={CITY_OPTIONS} value={city} onSelect={setCity} onClose={() => setCityOpen(false)} searchable />
    </Screen>
  );
}

export default function CheckoutScreen() {
  return (
    <RequireAuth message="Log in to place your order. Your cart is saved.">
      <CheckoutForm />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.h3, marginTop: spacing.lg, marginBottom: spacing.sm },
  segment: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 68,
  },
  segmentItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, textAlign: "center" },
  segmentTextActive: { color: "#fff" },
  groupRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 6 },
  groupName: { ...typography.body, fontWeight: "600" },
  groupValue: { ...typography.body, fontWeight: "600" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { ...typography.h3 },
  totalValue: { fontSize: 20, fontWeight: "800", color: colors.primary },
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm, textAlign: "center" },
  success: { alignItems: "center", paddingVertical: spacing.xxl },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  successTitle: { ...typography.h1, marginTop: spacing.lg },
  successSub: { ...typography.bodySmall, marginTop: spacing.xs },
  orderTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  orderSupplier: { ...typography.h3, marginTop: 2 },
  orderTotal: { fontSize: 15, fontWeight: "700", color: colors.primary },
  orderLink: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: spacing.sm },
  orderLinkText: { color: colors.primary, fontWeight: "600", fontSize: 13 },
});
