import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SAUDI_CITIES, type Address, type CarrierCode, type CheckoutResult, type DeliveryQuote, type OrderExtended, type PaymentConfig, type PaymentMethod } from "@mysupplier/shared";
import { Screen, Button, Card, KeyValue, TextField, PickerField, PickerModal, EmptyState, LoadingView, RequireAuth, StatusBadge, AddressSheet } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart, type CartGroup } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { startCardPayment } from "@/lib/payments";
import { colors, radius, spacing, typography } from "@/theme";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function etaLabel(days: number): string {
  if (days <= 0) return "Same day";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** One delivery option (carrier + service + ETA + price). */
function QuoteRow({ quote, selected, onPress }: { quote: DeliveryQuote; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.quoteRow, selected && styles.quoteRowActive]} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.quoteCarrier}>
          {quote.carrierName}
          <Text style={styles.quoteService}> · {quote.service}</Text>
        </Text>
        <Text style={typography.caption}>
          ETA {etaLabel(quote.etaDays)} · {quote.zone.replace(/_/g, " ").toLowerCase()}
          {quote.weightKg ? ` · ${Math.round(quote.weightKg)} kg` : ""}
          {quote.notes ? ` · ${quote.notes}` : ""}
        </Text>
      </View>
      <Text style={styles.quotePrice}>{formatSar(quote.price)}</Text>
    </Pressable>
  );
}

/** Bottom sheet with every carrier option for one supplier group (POST /shipping/quote). */
function QuoteOptionsSheet({
  group,
  city,
  current,
  onSelect,
  onClose,
}: {
  group: CartGroup | null;
  city: string;
  current: DeliveryQuote | null;
  onSelect: (quote: DeliveryQuote) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<DeliveryQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group || !city) return;
    let cancelled = false;
    setOptions(null);
    setError(null);
    api
      .shippingQuote({
        supplierCompanyId: group.supplierId ?? undefined,
        items: group.items.map((i) => ({ materialId: i.material.id, quantity: i.quantity })),
        deliveryCity: city,
        pickupCity: group.city || undefined,
      })
      .then((q) => {
        if (!cancelled) setOptions(q);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [group, city]);

  return (
    <Modal visible={Boolean(group)} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>Delivery options</Text>
            <Text style={typography.caption} numberOfLines={1}>
              {group?.supplierName} → {city}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        {options === null && !error ? (
          <View style={styles.sheetLoading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={typography.bodySmall}>Getting carrier quotes…</Text>
          </View>
        ) : error ? (
          <Text style={[typography.bodySmall, { color: colors.danger, padding: spacing.lg }]}>{error}</Text>
        ) : options && options.length === 0 ? (
          <Text style={[typography.bodySmall, { padding: spacing.lg }]}>No carrier rates for this route yet. The supplier will deliver at the flat fee.</Text>
        ) : (
          options?.map((q) => (
            <QuoteRow
              key={`${q.carrier}:${q.service}`}
              quote={q}
              selected={Boolean(current && current.carrier === q.carrier && current.service === q.service)}
              onPress={() => {
                onSelect(q);
                onClose();
              }}
            />
          ))
        )}
      </SafeAreaView>
    </Modal>
  );
}

function CheckoutForm() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, token } = useAuth();
  const { items, groups, summary, loading, refresh, quotes, deliveryCity, setDeliveryCity, coupon, couponCode, credit } = useCart();
  // Address book: pick a saved address (fills city / address / phone) or type one.
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState(false);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [quoteBusy, setQuoteBusy] = useState(false);
  /** Carrier chosen per supplier id when the buyer picks something other than the cheapest quote. */
  const [chosen, setChosen] = useState<Record<string, DeliveryQuote>>({});
  const [optionsFor, setOptionsFor] = useState<CartGroup | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const cardEnabled = Boolean(paymentConfig?.cardPaymentsEnabled);

  // Card payments are offered only when the gateway is configured server-side.
  useEffect(() => {
    let cancelled = false;
    api
      .paymentConfig()
      .then((cfg) => {
        if (!cancelled) setPaymentConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setPaymentConfig({ provider: "MANUAL", cardPaymentsEnabled: false, currency: "SAR", methods: ["COD", "BANK_TRANSFER"] });
      });
    return () => {
      cancelled = true;
    };
  }, []);


  const [city, setCity] = useState<string>(user?.company?.city ?? "");
  const [cityOpen, setCityOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");

  /** Apply a saved address to the delivery fields (the API does the same server-side from `addressId`). */
  const applyAddress = (a: Address) => {
    setAddressId(a.id);
    setManualAddress(false);
    setCity(a.city);
    setAddress([a.street, a.building, a.district].filter(Boolean).join(", "));
    setPhone(a.phone || user?.phone || "");
  };

  useEffect(() => {
    let cancelled = false;
    api
      .addresses()
      .then((list) => {
        if (cancelled) return;
        setAddresses(list);
        const preferred = list.find((a) => a.isDefault) ?? list[0];
        if (preferred) applyAddress(preferred);
        else setManualAddress(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAddresses([]);
          setManualAddress(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  useEffect(() => {
    if (paymentConfig && !cardEnabled && payment === "CARD") setPayment("COD");
  }, [paymentConfig, cardEnabled, payment]);

  const creditOk = Boolean(credit?.approved);
  const creditCovers = Boolean(credit?.canCoverCart);
  useEffect(() => {
    if (payment === "CREDIT" && !creditOk) setPayment("COD");
  }, [payment, creditOk]);

  // Re-price delivery whenever the destination changes (GET /cart?deliveryCity=).
  useEffect(() => {
    if (!city || city === deliveryCity) return;
    let cancelled = false;
    setQuoteBusy(true);
    setChosen({});
    setDeliveryCity(city).finally(() => {
      if (!cancelled) setQuoteBusy(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  /** Quote shown for a group: the buyer's pick, else the server's cheapest, else null (flat fee). */
  const quoteFor = (g: CartGroup): DeliveryQuote | null => {
    if (!g.supplierId) return null;
    return chosen[g.supplierId] ?? quotes[g.supplierId] ?? null;
  };

  // The server total uses the cheapest quote; adjust locally when the buyer picked a pricier option.
  const deliveryAdjustment = useMemo(() => {
    let delta = 0;
    groups.forEach((g) => {
      if (!g.supplierId) return;
      const picked = chosen[g.supplierId];
      const base = quotes[g.supplierId];
      if (picked && base) delta += picked.price - base.price;
    });
    return round2(delta);
  }, [groups, chosen, quotes]);
  const displayDelivery = round2(summary.deliveryFee + deliveryAdjustment);
  const displayTotal = round2(summary.total + deliveryAdjustment);

  const carrierBySupplier = useMemo(() => {
    const map: Record<string, CarrierCode> = {};
    groups.forEach((g) => {
      const q = quoteFor(g);
      if (g.supplierId && q) map[g.supplierId] = q.carrier;
    });
    return Object.keys(map).length ? map : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, chosen, quotes]);

  const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; hint?: string; icon: "cash-outline" | "business-outline" | "card-outline" | "wallet-outline"; disabled?: boolean; badge?: string }> = [
    { value: "COD", label: t("cod"), icon: "cash-outline" },
    { value: "BANK_TRANSFER", label: t("bankTransfer"), hint: "Bank details and the order reference are shown after checkout", icon: "business-outline" },
    { value: "CARD", label: t("card"), hint: cardEnabled ? t("cardOnlineHint") : t("cardUnavailable"), icon: "card-outline", disabled: !cardEnabled },
    ...(credit && creditOk
      ? [
          {
            value: "CREDIT" as PaymentMethod,
            label: t("creditTerms"),
            hint: creditCovers
              ? `${t("creditAvailable")} ${formatSar(credit.available)} · ${t("creditPayWithin")} ${credit.termsDays} ${t("days")}`
              : `${t("creditInsufficient")} (${t("creditAvailable")} ${formatSar(credit.available)})`,
            icon: "wallet-outline" as const,
            disabled: !creditCovers,
            badge: `${credit.termsDays}d`,
          },
        ]
      : []),
  ];

  /** Run the hosted card payment for one order; verify on return and update the result list. */
  const payOrder = async (order: OrderExtended) => {
    if (!token) return;
    setPaying(order.id);
    setPayError(null);
    try {
      const outcome = await startCardPayment(order.id, token);
      if (outcome.kind === "returned") {
        router.push({ pathname: "/payment", params: { order: outcome.orderId, id: outcome.paymentId ?? "", status: outcome.status ?? "" } });
        // Refresh this order so the success list reflects the payment.
        api
          .order(order.id)
          .then((fresh) => setResult((prev) => (prev ? { ...prev, orders: prev.orders.map((o) => (o.id === fresh.id ? fresh : o)) } : prev)))
          .catch(() => undefined);
      }
    } catch (err) {
      setPayError(getErrorMessage(err));
    } finally {
      setPaying(null);
    }
  };

  const useSaved = !manualAddress && Boolean(addressId);
  const validate = () => {
    const next: typeof errors = {};
    if (useSaved) {
      setErrors({});
      return true;
    }
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
        carrierBySupplier,
        addressId: useSaved ? (addressId as string) : undefined,
        poNumber: poNumber.trim() || undefined,
        couponCode: coupon && couponCode ? couponCode : undefined,
      });
      setResult(res);
      void refresh();
      if (payment === "CARD" && res.orders.length > 0) {
        // Start with the first order; the rest get "Pay now" buttons below.
        void payOrder(res.orders[0]);
      }
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
            {o.paymentMethod === "CARD" && (o.paymentStatus ?? "UNPAID") === "UNPAID" ? (
              <Button
                title={`${t("payNow")} · ${formatSar(o.total)}`}
                icon="card-outline"
                fullWidth
                loading={paying === o.id}
                disabled={paying !== null && paying !== o.id}
                onPress={() => payOrder(o)}
                style={{ marginTop: spacing.md }}
              />
            ) : null}
            {o.paymentStatus === "PAID" ? (
              <View style={[styles.orderLink, { justifyContent: "flex-start" }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.orderLinkText, { color: colors.success }]}>{t("paid")}</Text>
              </View>
            ) : null}
            <View style={styles.orderLink}>
              <Text style={styles.orderLinkText}>{t("viewOrder")}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </View>
          </Card>
        ))}
        {payError ? <Text style={styles.error}>{payError}</Text> : null}
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
      {addresses === null ? (
        <View style={styles.quoteLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={typography.caption}>{t("savedAddresses")}…</Text>
        </View>
      ) : null}
      {addresses && addresses.length && !manualAddress ? (
        <Card style={{ paddingVertical: spacing.sm }}>
          {addresses.map((a, i) => {
            const selected = addressId === a.id;
            return (
              <Pressable key={a.id} onPress={() => applyAddress(a)} style={[styles.addressRow, i > 0 && styles.addressRowBorder]} accessibilityRole="radio" accessibilityState={{ selected }}>
                <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.primary : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.addressLabel}>{a.label}</Text>
                    {a.isDefault ? <Text style={styles.defaultPill}>{t("defaultLabel")}</Text> : null}
                  </View>
                  <Text style={typography.caption} numberOfLines={2}>
                    {[a.street, a.building, a.district, a.city].filter(Boolean).join(", ")}
                  </Text>
                  <Text style={typography.caption}>
                    {a.recipient} · {a.phone}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <View style={styles.addressActions}>
            <Pressable onPress={() => setAddressSheetOpen(true)} style={styles.changeLink} hitSlop={6}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.changeLinkText}>{t("addAddress")}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setManualAddress(true);
                setAddressId(null);
              }}
              style={styles.changeLink}
              hitSlop={6}
            >
              <Text style={styles.changeLinkText}>{t("enterManually")}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
          </View>
        </Card>
      ) : addresses ? (
        <>
          <PickerField label={t("deliveryCity")} value={city} placeholder={t("selectCity")} onPress={() => setCityOpen(true)} error={errors.city} />
          <TextField
            label={t("deliveryAddress")}
            value={address}
            onChangeText={setAddress}
            placeholder="Site / warehouse address, district, landmarks"
            multiline
            error={errors.address}
          />
          <TextField
            label={t("contactPhone")}
            value={phone}
            onChangeText={setPhone}
            placeholder="+9665XXXXXXXX"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={errors.phone}
          />
          <View style={[styles.addressActions, { marginTop: -spacing.xs, marginBottom: spacing.md }]}>
            <Pressable onPress={() => setAddressSheetOpen(true)} style={styles.changeLink} hitSlop={6}>
              <Ionicons name="bookmark-outline" size={14} color={colors.primary} />
              <Text style={styles.changeLinkText}>{t("addAddress")}</Text>
            </Pressable>
            {addresses.length ? (
              <Pressable
                onPress={() => {
                  const preferred = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
                  applyAddress(preferred);
                }}
                style={styles.changeLink}
                hitSlop={6}
              >
                <Text style={styles.changeLinkText}>{t("useSavedAddress")}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
      <TextField label={`${t("poNumber")} (${t("optional")})`} value={poNumber} onChangeText={setPoNumber} placeholder="PO-2026-0042" hint={t("poNumberHint")} autoCapitalize="characters" maxLength={40} />

      <Text style={styles.sectionTitle}>{t("paymentMethod")}</Text>
      <View style={styles.segment}>
        {PAYMENT_OPTIONS.map((opt) => {
          const active = payment === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => !opt.disabled && setPayment(opt.value)}
              disabled={opt.disabled}
              accessibilityState={{ selected: active, disabled: opt.disabled }}
              style={[styles.segmentItem, active && styles.segmentItemActive, opt.disabled && styles.segmentItemDisabled]}
            >
              <Ionicons name={opt.icon} size={18} color={active ? "#fff" : opt.disabled ? colors.textMuted : colors.textSecondary} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive, opt.disabled && { color: colors.textMuted }]} numberOfLines={2}>
                {opt.label}
              </Text>
              {opt.badge ? <Text style={[styles.soon, active && { color: "rgba(255,255,255,0.85)" }]}>{opt.badge}</Text> : opt.disabled ? <Text style={styles.soon}>{opt.value === "CARD" ? "Soon" : "—"}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {PAYMENT_OPTIONS.find((o) => o.value === payment)?.hint ? (
        <Text style={[typography.caption, { marginTop: -spacing.sm, marginBottom: spacing.md }]}>{PAYMENT_OPTIONS.find((o) => o.value === payment)?.hint}</Text>
      ) : null}

      {payment === "CREDIT" && credit ? (
        <View style={styles.creditBox}>
          <Ionicons name="wallet-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.creditTitle}>
              {t("creditAvailable")}: {formatSar(credit.available)} / {formatSar(credit.limit)}
            </Text>
            <Text style={typography.caption}>
              {t("creditPayWithin")} {credit.termsDays} {t("days")} · {t("total")} {formatSar(summary.total)}
            </Text>
          </View>
        </View>
      ) : null}

      <TextField label={t("notes")} value={notes} onChangeText={setNotes} placeholder="Delivery window, crane access, gate code..." multiline />

      <Text style={styles.sectionTitle}>{t("delivery")}</Text>
      {!city ? (
        <Card>
          <Text style={typography.bodySmall}>Select the delivery city to see carrier options and prices per supplier.</Text>
        </Card>
      ) : (
        groups.map((g) => {
          const q = quoteFor(g);
          const isChosen = Boolean(g.supplierId && chosen[g.supplierId]);
          return (
            <Card key={`ship:${g.key}`} style={{ paddingVertical: spacing.md }}>
              <View style={styles.groupRow}>
                <Ionicons name="storefront-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.groupName, { flex: 1 }]} numberOfLines={1}>
                  {g.supplierName}
                </Text>
                <Text style={typography.caption}>
                  {g.city} → {city}
                </Text>
              </View>
              {quoteBusy && !q ? (
                <View style={styles.quoteLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={typography.caption}>Getting delivery quotes…</Text>
                </View>
              ) : q ? (
                <View style={styles.quoteSummary}>
                  <View style={styles.quoteIcon}>
                    <Ionicons name={q.carrier === "SUPPLIER" ? "car-outline" : q.carrier === "SMSA" || q.carrier === "ARAMEX" || q.carrier === "SPL" ? "cube-outline" : "bus-outline"} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quoteCarrier}>
                      {q.carrierName}
                      <Text style={styles.quoteService}> · {q.service}</Text>
                    </Text>
                    <Text style={typography.caption}>
                      ETA {etaLabel(q.etaDays)}
                      {isChosen ? " · your choice" : " · cheapest"}
                    </Text>
                  </View>
                  <Text style={styles.quotePrice}>{formatSar(q.price)}</Text>
                </View>
              ) : (
                <View style={styles.quoteSummary}>
                  <View style={styles.quoteIcon}>
                    <Ionicons name="car-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quoteCarrier}>{t("deliveredBySupplier")}</Text>
                    <Text style={typography.caption}>Flat delivery fee · supplier arranges transport</Text>
                  </View>
                </View>
              )}
              {g.supplierId ? (
                <Pressable onPress={() => setOptionsFor(g)} style={styles.changeLink} hitSlop={6}>
                  <Text style={styles.changeLinkText}>{q ? "Change carrier" : t("chooseCarrier")}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                </Pressable>
              ) : null}
            </Card>
          );
        })
      )}

      <Text style={styles.sectionTitle}>{t("orderSummary")}</Text>
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
        {summary.savings > 0 ? <KeyValue label={t("youSave")} value={`-${formatSar(summary.savings)}`} /> : null}
        {coupon && summary.discount > 0 ? <KeyValue label={`${t("discount")} (${coupon.code})`} value={`-${formatSar(summary.discount)}`} /> : null}
        <KeyValue label={t("vat")} value={formatSar(summary.vat)} />
        <KeyValue label={t("deliveryFee")} value={quoteBusy ? "…" : formatSar(displayDelivery)} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t("total")}</Text>
          <Text style={styles.totalValue}>{quoteBusy ? "…" : formatSar(displayTotal)}</Text>
        </View>
        <Text style={typography.caption}>
          One order is created per supplier ({groups.length}). Suppliers confirm and arrange delivery.
        </Text>
      </Card>

      {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
      <Button title={`${t("placeOrder")} · ${formatSar(displayTotal)}`} size="lg" fullWidth loading={submitting} disabled={quoteBusy} onPress={placeOrder} />

      <PickerModal visible={cityOpen} title={t("deliveryCity")} options={CITY_OPTIONS} value={city} onSelect={setCity} onClose={() => setCityOpen(false)} searchable />
      <AddressSheet
        visible={addressSheetOpen}
        onClose={() => setAddressSheetOpen(false)}
        onSaved={(a) => {
          setAddresses((prev) => {
            const rest = (prev ?? []).filter((x) => x.id !== a.id).map((x) => (a.isDefault ? { ...x, isDefault: false } : x));
            return [a, ...rest];
          });
          applyAddress(a);
        }}
      />
      <QuoteOptionsSheet
        group={optionsFor}
        city={city}
        current={optionsFor ? quoteFor(optionsFor) : null}
        onSelect={(q) => {
          if (optionsFor?.supplierId) setChosen((prev) => ({ ...prev, [optionsFor.supplierId as string]: q }));
        }}
        onClose={() => setOptionsFor(null)}
      />
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
  segment: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  segmentItem: {
    flexGrow: 1,
    flexBasis: "30%",
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
  segmentItemDisabled: { backgroundColor: colors.neutralLight, borderStyle: "dashed" },
  soon: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
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
  quoteLoading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.sm },
  addressRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  addressLabel: { ...typography.body, fontWeight: "600" },
  defaultPill: { ...typography.caption, color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm, fontWeight: "600", overflow: "hidden" },
  addressActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  creditBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight, marginBottom: spacing.md },
  creditTitle: { ...typography.body, fontWeight: "600", color: colors.primary },
  quoteSummary: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.sm },
  quoteIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  quoteCarrier: { ...typography.body, fontWeight: "600" },
  quoteService: { ...typography.bodySmall, fontWeight: "400" },
  quotePrice: { fontSize: 15, fontWeight: "700", color: colors.primary },
  changeLink: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: spacing.sm },
  changeLinkText: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  quoteRowActive: { backgroundColor: colors.primaryLight },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: spacing.lg, maxHeight: "80%" },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetLoading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg },
});
