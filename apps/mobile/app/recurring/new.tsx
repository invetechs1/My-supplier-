import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SAUDI_CITIES, type Address, type RecurringOrderLine, type RecurringPaymentMethod } from "@mysupplier/shared";
import { Screen, Button, Card, EmptyState, TextField, PickerField, PickerModal, QtyStepper, RequireAuth, LoadingView } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatDate, isValidYmd } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));
const INTERVALS = [7, 14, 21, 30, 45, 60, 90];

type Line = RecurringOrderLine;

function parseLines(raw: string | undefined): Line[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is Line => Boolean(l) && typeof l === "object" && typeof (l as Line).listingId === "string" && typeof (l as Line).quantity === "number")
      .map((l) => ({ listingId: l.listingId, quantity: Math.max(1, Math.round(l.quantity)), name: l.name, unit: l.unit, companyName: l.companyName }));
  } catch {
    return [];
  }
}

function NewRecurringContent() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const { items: cartItems, credit } = useCart();
  const params = useLocalSearchParams<{ source?: string; items?: string; listId?: string }>();

  const [lines, setLines] = useState<Line[]>(() => parseLines(params.items));
  const [linesLoading, setLinesLoading] = useState(false);
  const [name, setName] = useState("");
  const [intervalDays, setIntervalDays] = useState(30);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [city, setCity] = useState(user?.company?.city ?? "");
  const [cityOpen, setCityOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [payment, setPayment] = useState<RecurringPaymentMethod>("COD");
  const [startAt, setStartAt] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressOpen, setAddressOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; city?: string; address?: string; phone?: string; startAt?: string; lines?: string }>({});
  const [busy, setBusy] = useState(false);

  // Seed lines: explicit `items`, a wishlist, or the current cart.
  useEffect(() => {
    if (params.items) return;
    if (params.source === "list" && params.listId) {
      setLinesLoading(true);
      api
        .wishlist(params.listId)
        .then((list) => {
          setLines(
            list.items
              .filter((i) => i.material?.bestOffer?.listingId)
              .map((i) => ({
                listingId: (i.listingId && i.material?.bestOffer?.listingId === i.listingId ? i.listingId : i.material?.bestOffer?.listingId) as string,
                quantity: Math.max(i.quantity, i.material?.bestOffer?.minQty || 1),
                name: i.material?.name,
                unit: i.material?.unit,
                companyName: i.material?.bestOffer?.companyName,
              })),
          );
          if (!name) setName(list.name);
        })
        .catch(() => undefined)
        .finally(() => setLinesLoading(false));
      return;
    }
    setLines(cartItems.map((i) => ({ listingId: i.listingId, quantity: i.quantity, name: i.material.name, unit: i.material.unit, companyName: i.offer.companyName })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.source, params.items, params.listId]);

  useEffect(() => {
    api
      .addresses()
      .then((list) => {
        setAddresses(list);
        const preferred = list.find((a) => a.isDefault) ?? list[0];
        if (preferred && !address) {
          setCity(preferred.city);
          setAddress([preferred.street, preferred.building, preferred.district].filter(Boolean).join(", "));
          setPhone(preferred.phone || user?.phone || "");
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paymentOptions = useMemo(() => {
    const opts: Array<{ value: RecurringPaymentMethod; label: string; icon: "cash-outline" | "business-outline" | "wallet-outline" }> = [
      { value: "COD", label: t("cod"), icon: "cash-outline" },
      { value: "BANK_TRANSFER", label: t("bankTransfer"), icon: "business-outline" },
    ];
    if (credit?.approved) opts.push({ value: "CREDIT", label: t("creditTerms"), icon: "wallet-outline" });
    return opts;
  }, [t, credit?.approved]);

  const firstRun = startAt && isValidYmd(startAt) ? startAt : null;
  const defaultFirstRun = new Date(Date.now() + intervalDays * 86400000).toISOString();

  const submit = async () => {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = t("recurringName");
    if (!city) next.city = t("selectCity");
    if (address.trim().length < 5) next.address = t("deliveryAddress");
    if (phone.trim().length < 7) next.phone = t("contactPhone");
    if (startAt && !isValidYmd(startAt)) next.startAt = "YYYY-MM-DD";
    if (!lines.length) next.lines = t("lines");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.createRecurring({
        name: name.trim(),
        items: lines.map((l) => ({ listingId: l.listingId, quantity: l.quantity })),
        intervalDays,
        deliveryCity: city,
        deliveryAddress: address.trim(),
        contactPhone: phone.trim(),
        paymentMethod: payment,
        startAt: firstRun ? new Date(`${firstRun}T08:00:00`).toISOString() : undefined,
      });
      Alert.alert(t("recurringCreated"), `${name.trim()} · ${t("interval").toLowerCase()} ${intervalDays} ${t("days")}`, [{ text: t("done"), onPress: () => router.replace("/recurring") }]);
    } catch (err) {
      Alert.alert(t("newRecurring"), getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!user?.companyId) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t("newRecurring") }} />
        <EmptyState icon="business-outline" title={t("companyRequired")} actionTitle={t("account")} onAction={() => router.push("/account")} />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("newRecurring") }} />

      <Text style={styles.sectionTitle}>
        {t("lines")} ({lines.length})
      </Text>
      {linesLoading ? (
        <LoadingView style={{ minHeight: 80 }} />
      ) : lines.length === 0 ? (
        <Card>
          <Text style={typography.bodySmall}>{t("cartEmptyHint")}</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <Button title={t("shop")} size="sm" variant="secondary" onPress={() => router.push("/(tabs)/shop")} />
            <Button title={t("buyAgain")} size="sm" variant="secondary" onPress={() => router.replace("/buy-again")} />
          </View>
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {lines.map((l, i) => (
            <View key={`${l.listingId}:${i}`} style={[styles.line, i > 0 && styles.lineBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {l.name ?? l.listingId}
                </Text>
                <Text style={typography.caption}>
                  {l.companyName ?? ""}
                  {l.unit ? ` · ${l.unit}` : ""}
                </Text>
              </View>
              <QtyStepper value={l.quantity} onChange={(q) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: q } : x)))} min={1} size="sm" />
              <Pressable onPress={() => setLines((prev) => prev.filter((_, j) => j !== i))} hitSlop={8} style={styles.trash} accessibilityLabel={t("remove")}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
      {errors.lines ? <Text style={styles.error}>{errors.lines}</Text> : null}

      <Text style={styles.sectionTitle}>{t("recurringOrders")}</Text>
      <TextField label={t("recurringName")} value={name} onChangeText={setName} placeholder={t("recurringNamePlaceholder")} error={errors.name} maxLength={80} />
      <PickerField label={t("interval")} value={`${intervalDays} ${t("days")}${intervalDays % 7 === 0 ? ` (${intervalDays / 7} ${intervalDays === 7 ? t("week") : t("weeks")})` : ""}`} onPress={() => setIntervalOpen(true)} />
      <TextField
        label={`${t("startDate")} (${t("optional")})`}
        value={startAt}
        onChangeText={setStartAt}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        error={errors.startAt}
        hint={`${t("afterOneInterval")}: ${formatDate(defaultFirstRun)}`}
      />

      <Text style={styles.sectionTitle}>{t("deliveryDetails")}</Text>
      {addresses.length ? <PickerField label={t("savedAddresses")} value={addresses.find((a) => a.city === city && address.startsWith(a.street))?.label ?? ""} placeholder={t("useSavedAddress")} onPress={() => setAddressOpen(true)} /> : null}
      <PickerField label={t("deliveryCity")} value={city} placeholder={t("selectCity")} onPress={() => setCityOpen(true)} error={errors.city} />
      <TextField label={t("deliveryAddress")} value={address} onChangeText={setAddress} multiline error={errors.address} />
      <TextField label={t("contactPhone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+9665XXXXXXXX" error={errors.phone} />

      <Text style={styles.sectionTitle}>{t("paymentMethod")}</Text>
      <View style={styles.segment}>
        {paymentOptions.map((opt) => {
          const active = payment === opt.value;
          return (
            <Pressable key={opt.value} onPress={() => setPayment(opt.value)} style={[styles.segmentItem, active && styles.segmentItemActive]} accessibilityState={{ selected: active }}>
              <Ionicons name={opt.icon} size={18} color={active ? "#fff" : colors.textSecondary} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={2}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Button title={t("createRecurring")} icon="calendar-outline" size="lg" fullWidth loading={busy} disabled={!lines.length} onPress={() => void submit()} style={{ marginTop: spacing.md }} />

      <PickerModal
        visible={intervalOpen}
        title={t("interval")}
        options={INTERVALS.map((d) => ({ value: String(d), label: `${d} ${t("days")}`, subtitle: d % 7 === 0 ? `${d / 7} ${d === 7 ? t("week") : t("weeks")}` : undefined }))}
        value={String(intervalDays)}
        onSelect={(v) => setIntervalDays(Number(v))}
        onClose={() => setIntervalOpen(false)}
      />
      <PickerModal visible={cityOpen} title={t("deliveryCity")} options={CITY_OPTIONS} value={city} onSelect={setCity} onClose={() => setCityOpen(false)} searchable />
      <PickerModal
        visible={addressOpen}
        title={t("savedAddresses")}
        options={addresses.map((a) => ({ value: a.id, label: a.label, subtitle: [a.street, a.city].filter(Boolean).join(", ") }))}
        onSelect={(id) => {
          const a = addresses.find((x) => x.id === id);
          if (!a) return;
          setCity(a.city);
          setAddress([a.street, a.building, a.district].filter(Boolean).join(", "));
          setPhone(a.phone || phone);
        }}
        onClose={() => setAddressOpen(false)}
      />
    </Screen>
  );
}

export default function NewRecurringScreen() {
  return (
    <RequireAuth roles={["BUYER"]}>
      <NewRecurringContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.h3, marginTop: spacing.lg, marginBottom: spacing.sm },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  lineBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineName: { ...typography.body, fontWeight: "500" },
  trash: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.dangerLight, alignItems: "center", justifyContent: "center" },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  segment: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 64 },
  segmentItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, textAlign: "center" },
  segmentTextActive: { color: "#fff" },
});
