import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SAUDI_CITIES, UNITS, type CreateRfqPayload, type Material } from "@mysupplier/shared";
import {
  Screen,
  Button,
  TextField,
  PickerField,
  PickerModal,
  MaterialSearchModal,
  RequireAuth,
  Card,
} from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isValidYmd, toIsoDateInDays } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

interface DraftItem {
  key: string;
  materialId?: string;
  materialName?: string;
  description: string;
  quantity: string;
  unit: string;
}

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));
const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u }));
const CLOSE_OPTIONS = [
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
];

let keySeq = 0;
const newKey = () => `item-${Date.now()}-${keySeq++}`;

function itemFromMaterial(m: Material): DraftItem {
  return {
    key: newKey(),
    materialId: m.id,
    materialName: m.name,
    description: m.name,
    quantity: "",
    unit: m.unit,
  };
}

function NewRfqForm() {
  const router = useRouter();
  const { materialId } = useLocalSearchParams<{ materialId?: string }>();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [city, setCity] = useState<string>(user?.company?.city ?? "");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [closesInDays, setClosesInDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  const [cityOpen, setCityOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [unitPickerFor, setUnitPickerFor] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill from ?materialId=
  useEffect(() => {
    if (!materialId) return;
    let cancelled = false;
    api
      .material(materialId)
      .then((m) => {
        if (cancelled) return;
        setItems((prev) => (prev.some((i) => i.materialId === m.id) ? prev : [...prev, itemFromMaterial(m)]));
        setTitle((t) => t || `Quote request: ${m.name}`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  const updateItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const addCustomItem = () =>
    setItems((prev) => [...prev, { key: newKey(), description: "", quantity: "", unit: "piece" }]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Give your RFQ a title";
    if (!city) next.city = "Select a delivery city";
    if (deliveryDate && !isValidYmd(deliveryDate)) next.deliveryDate = "Use the format YYYY-MM-DD";
    if (items.length === 0) next.items = "Add at least one item";
    items.forEach((i) => {
      if (!i.description.trim()) next[`${i.key}.description`] = "Required";
      const q = Number(i.quantity);
      if (!i.quantity || Number.isNaN(q) || q <= 0) next[`${i.key}.quantity`] = "Enter a quantity";
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const payload: CreateRfqPayload = {
      title: title.trim(),
      deliveryCity: city,
      deliveryDate: deliveryDate || undefined,
      closesAt: toIsoDateInDays(Number(closesInDays)),
      notes: notes.trim() || undefined,
      items: items.map((i) => ({
        materialId: i.materialId,
        description: i.description.trim(),
        quantity: Number(i.quantity),
        unit: i.unit,
      })),
    };
    try {
      const rfq = await api.createRfq(payload);
      router.replace(`/rfq/${rfq.id}`);
    } catch (err) {
      Alert.alert("Could not create RFQ", getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <Text style={styles.intro}>
        Suppliers in your area will be notified and can bid until the RFQ closes.
      </Text>

      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Cement and rebar for Villa 12" error={errors.title} />
      <PickerField label="Delivery city" value={city} placeholder="Select city" onPress={() => setCityOpen(true)} error={errors.city} />
      <TextField
        label="Delivery date (optional)"
        value={deliveryDate}
        onChangeText={setDeliveryDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        error={errors.deliveryDate}
      />
      <PickerField
        label="Accept bids for"
        value={CLOSE_OPTIONS.find((o) => o.value === closesInDays)?.label}
        onPress={() => setCloseOpen(true)}
      />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Delivery instructions, brand preferences, payment terms..." />

      <View style={styles.itemsHeader}>
        <Text style={typography.h3}>Items ({items.length})</Text>
        {errors.items ? <Text style={styles.err}>{errors.items}</Text> : null}
      </View>

      {items.map((item, idx) => (
        <Card key={item.key} style={styles.itemCard}>
          <View style={styles.itemTop}>
            <Text style={styles.itemIndex}>#{idx + 1}</Text>
            {item.materialName ? (
              <View style={styles.matPill}>
                <Ionicons name="cube-outline" size={12} color={colors.primary} />
                <Text style={styles.matPillText} numberOfLines={1}>
                  {item.materialName}
                </Text>
              </View>
            ) : (
              <Text style={typography.caption}>Custom item</Text>
            )}
            <Pressable onPress={() => removeItem(item.key)} hitSlop={8} style={{ marginLeft: "auto" }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
          <TextField
            label="Description"
            value={item.description}
            onChangeText={(v) => updateItem(item.key, { description: v })}
            placeholder="e.g. OPC cement 50kg bags"
            error={errors[`${item.key}.description`]}
          />
          <View style={styles.row}>
            <TextField
              label="Quantity"
              value={item.quantity}
              onChangeText={(v) => updateItem(item.key, { quantity: v.replace(/[^0-9.]/g, "") })}
              keyboardType="decimal-pad"
              placeholder="0"
              containerStyle={{ flex: 1 }}
              error={errors[`${item.key}.quantity`]}
            />
            <PickerField label="Unit" value={item.unit} onPress={() => setUnitPickerFor(item.key)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}

      <View style={styles.addRow}>
        <Button title="Add material" icon="search-outline" variant="secondary" onPress={() => setMaterialOpen(true)} style={{ flex: 1 }} />
        <Button title="Custom item" icon="add-outline" variant="outline" onPress={addCustomItem} style={{ flex: 1 }} />
      </View>

      <Button title="Publish RFQ" size="lg" fullWidth loading={submitting} onPress={onSubmit} style={{ marginTop: spacing.xl }} />

      <PickerModal visible={cityOpen} title="Delivery city" options={CITY_OPTIONS} value={city} onSelect={setCity} onClose={() => setCityOpen(false)} searchable />
      <PickerModal visible={closeOpen} title="Accept bids for" options={CLOSE_OPTIONS} value={closesInDays} onSelect={setClosesInDays} onClose={() => setCloseOpen(false)} />
      <PickerModal
        visible={unitPickerFor !== null}
        title="Unit"
        options={UNIT_OPTIONS}
        value={items.find((i) => i.key === unitPickerFor)?.unit}
        onSelect={(u) => {
          if (unitPickerFor) updateItem(unitPickerFor, { unit: u });
        }}
        onClose={() => setUnitPickerFor(null)}
      />
      <MaterialSearchModal
        visible={materialOpen}
        onClose={() => setMaterialOpen(false)}
        onSelect={(m) => setItems((prev) => [...prev, itemFromMaterial(m)])}
      />
    </Screen>
  );
}

export default function NewRfqScreen() {
  return (
    <RequireAuth roles={["BUYER"]} message="Create a buyer account to request quotes from suppliers.">
      <NewRfqForm />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  intro: { ...typography.bodySmall, marginVertical: spacing.lg },
  itemsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, marginBottom: spacing.md },
  err: { ...typography.caption, color: colors.danger },
  itemCard: { paddingBottom: spacing.xs },
  itemTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  itemIndex: { ...typography.label, color: colors.textMuted },
  matPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    maxWidth: "70%",
  },
  matPillText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  row: { flexDirection: "row", gap: spacing.md },
  addRow: { flexDirection: "row", gap: spacing.md },
});
