import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SAUDI_CITIES, type CompanyProfile, type VerificationStatus } from "@mysupplier/shared";
import { Screen, Button, Card, SectionHeader, TextField, KeyValue, LoadingView, ErrorView, RequireAuth } from "@/components";
import { api, getErrorMessage, type CompanyProfilePatch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

const VERIFICATION: Record<VerificationStatus, { label: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = {
  PENDING: { label: "Not verified", bg: colors.warningLight, fg: colors.warning, icon: "time-outline", hint: "Upload your CR and VAT certificate on the web portal to get verified." },
  UNDER_REVIEW: { label: "Under review", bg: colors.infoLight, fg: colors.info, icon: "hourglass-outline", hint: "Our team is reviewing your documents. This usually takes 1–2 business days." },
  VERIFIED: { label: "Verified", bg: colors.successLight, fg: colors.success, icon: "checkmark-circle", hint: "Buyers see the verified badge next to your prices and bids." },
  REJECTED: { label: "Rejected", bg: colors.dangerLight, fg: colors.danger, icon: "close-circle", hint: "Please check the notes below and re-submit your documents." },
};

interface FormState {
  name: string;
  nameAr: string;
  description: string;
  citiesServed: string[];
  minOrderValue: string;
  deliveryFee: string;
  deliveryDays: string;
  workingHours: string;
  phone: string;
  email: string;
  website: string;
  lowStockThreshold: string;
}

function toForm(c: CompanyProfile): FormState {
  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    name: c.name ?? "",
    nameAr: c.nameAr ?? "",
    description: c.description ?? "",
    citiesServed: Array.isArray(c.citiesServed) ? [...c.citiesServed] : [],
    minOrderValue: num(c.minOrderValue),
    deliveryFee: num(c.deliveryFee),
    deliveryDays: num(c.deliveryDays),
    workingHours: c.workingHours ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    website: c.website ?? "",
    lowStockThreshold: num(c.lowStockThreshold),
  };
}

function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function CompanyContent() {
  const { t } = useI18n();
  const { canManageCompany, companyRole, refreshUser } = useAuth();
  const { data, loading, error, refreshing, reload, refresh, setData } = useApi(() => api.supplierCompany(), []);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const dirty = useMemo(() => (data && form ? JSON.stringify(toForm(data)) !== JSON.stringify(form) : false), [data, form]);
  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));
  const toggleCity = (city: string) =>
    setForm((f) => (f ? { ...f, citiesServed: f.citiesServed.includes(city) ? f.citiesServed.filter((c) => c !== city) : [...f.citiesServed, city] } : f));

  const save = async () => {
    if (!form || !data) return;
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Company name is required";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Enter a valid email";
    (["minOrderValue", "deliveryFee", "deliveryDays", "lowStockThreshold"] as const).forEach((k) => {
      if (form[k].trim() && (Number.isNaN(Number(form[k])) || Number(form[k]) < 0)) next[k] = "Enter a valid number";
    });
    if (!form.lowStockThreshold.trim()) next.lowStockThreshold = "Required";
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: CompanyProfilePatch = {
      name: form.name.trim(),
      nameAr: form.nameAr.trim() || null,
      description: form.description.trim() || null,
      citiesServed: form.citiesServed,
      minOrderValue: numOrNull(form.minOrderValue),
      deliveryFee: numOrNull(form.deliveryFee),
      deliveryDays: numOrNull(form.deliveryDays),
      workingHours: form.workingHours.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      lowStockThreshold: Number(form.lowStockThreshold),
    };
    setSaving(true);
    try {
      const updated = await api.updateSupplierCompany(body);
      setData(updated);
      setForm(toForm(updated));
      refreshUser().catch(() => undefined);
      Alert.alert("Saved", "Your company profile was updated.");
    } catch (err) {
      Alert.alert("Could not save", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data || !form) {
    return (
      <Screen>
        <ErrorView message={error ?? "Company profile unavailable"} onRetry={reload} />
      </Screen>
    );
  }

  const ver = VERIFICATION[data.verificationStatus] ?? VERIFICATION[data.verified ? "VERIFIED" : "PENDING"];
  const readOnly = !canManageCompany;

  return (
    <Screen scroll keyboard refreshing={refreshing} onRefresh={refresh} edges={["bottom", "left", "right"]}>
      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.verRow}>
          <View style={[styles.verBadge, { backgroundColor: ver.bg }]}>
            <Ionicons name={ver.icon} size={14} color={ver.fg} />
            <Text style={[styles.verText, { color: ver.fg }]}>{ver.label}</Text>
          </View>
          <Text style={typography.caption}>Member since {formatDate(data.createdAt)}</Text>
        </View>
        <Text style={[typography.bodySmall, { marginTop: spacing.sm }]}>{ver.hint}</Text>
        {data.verificationNotes ? <Text style={[typography.bodySmall, { marginTop: spacing.xs, color: colors.danger }]}>{data.verificationNotes}</Text> : null}
        <View style={{ marginTop: spacing.sm }}>
          <KeyValue label="Type" value={data.type} />
          <KeyValue label="Base city" value={data.city} />
          {data.crNumber ? <KeyValue label="CR number" value={data.crNumber} /> : null}
          {data.vatNumber ? <KeyValue label="VAT number" value={data.vatNumber} /> : null}
          {data.commissionPct !== null && data.commissionPct !== undefined ? <KeyValue label="Commission" value={`${data.commissionPct}%`} /> : null}
          <KeyValue label="Rating" value={data.ratingCount ? `${data.rating.toFixed(1)} / 5 (${data.ratingCount})` : "No ratings yet"} />
        </View>
      </Card>

      {readOnly ? (
        <View style={styles.readOnly}>
          <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
          <Text style={[typography.bodySmall, { flex: 1 }]}>You are viewing as {companyRole.toLowerCase()}. Only owners and managers can edit the profile.</Text>
        </View>
      ) : null}

      <SectionHeader title={t("companyProfile")} />
      <Card>
        <TextField label="Company name" value={form.name} onChangeText={(v) => patch({ name: v })} editable={!readOnly} error={errors.name} />
        <TextField label="Name (Arabic)" value={form.nameAr} onChangeText={(v) => patch({ nameAr: v })} editable={!readOnly} placeholder="اسم الشركة" />
        <TextField label="Description" value={form.description} onChangeText={(v) => patch({ description: v })} editable={!readOnly} multiline placeholder="What you supply, brands you carry, service areas…" />
        <TextField label="Working hours" value={form.workingHours} onChangeText={(v) => patch({ workingHours: v })} editable={!readOnly} placeholder="Sat–Thu 8:00–18:00" />
      </Card>

      <SectionHeader title="Cities served" />
      <Card>
        <View style={styles.cities}>
          {SAUDI_CITIES.map((city) => {
            const active = form.citiesServed.includes(city);
            return (
              <Pressable key={city} onPress={() => !readOnly && toggleCity(city)} disabled={readOnly} style={[styles.city, active && styles.cityActive]}>
                {active ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                <Text style={[styles.cityText, active && styles.cityTextActive]}>{city}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[typography.caption, { marginTop: spacing.sm }]}>
          {form.citiesServed.length ? `${form.citiesServed.length} selected · open RFQs from these cities appear on your dashboard.` : "Select the cities you deliver to."}
        </Text>
      </Card>

      <SectionHeader title="Delivery & orders" />
      <Card>
        <View style={styles.row}>
          <TextField label="Min. order (SAR)" value={form.minOrderValue} onChangeText={(v) => patch({ minOrderValue: v.replace(/[^0-9.]/g, "") })} editable={!readOnly} keyboardType="decimal-pad" placeholder="0" containerStyle={{ flex: 1 }} error={errors.minOrderValue} />
          <TextField label="Delivery fee (SAR)" value={form.deliveryFee} onChangeText={(v) => patch({ deliveryFee: v.replace(/[^0-9.]/g, "") })} editable={!readOnly} keyboardType="decimal-pad" placeholder="0" containerStyle={{ flex: 1 }} error={errors.deliveryFee} />
        </View>
        <View style={styles.row}>
          <TextField label="Delivery days" value={form.deliveryDays} onChangeText={(v) => patch({ deliveryDays: v.replace(/[^0-9]/g, "") })} editable={!readOnly} keyboardType="number-pad" placeholder="3" containerStyle={{ flex: 1 }} error={errors.deliveryDays} />
          <TextField label={`${t("lowStock")} threshold`} value={form.lowStockThreshold} onChangeText={(v) => patch({ lowStockThreshold: v.replace(/[^0-9]/g, "") })} editable={!readOnly} keyboardType="number-pad" placeholder="10" containerStyle={{ flex: 1 }} error={errors.lowStockThreshold} hint="Items at or below this level are flagged" />
        </View>
      </Card>

      <SectionHeader title="Contact" />
      <Card>
        <TextField label="Phone" value={form.phone} onChangeText={(v) => patch({ phone: v })} editable={!readOnly} keyboardType="phone-pad" placeholder="+9665XXXXXXXX" />
        <TextField label="Email" value={form.email} onChangeText={(v) => patch({ email: v })} editable={!readOnly} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="sales@company.com" error={errors.email} />
        <TextField label="Website" value={form.website} onChangeText={(v) => patch({ website: v })} editable={!readOnly} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" />
      </Card>

      {!readOnly ? (
        <View style={styles.actions}>
          <Button title="Discard" variant="ghost" disabled={!dirty || saving} onPress={() => setForm(toForm(data))} />
          <Button title={t("save")} size="lg" loading={saving} disabled={!dirty} onPress={save} style={{ flex: 1 }} />
        </View>
      ) : null}
    </Screen>
  );
}

export default function SupplierCompanyScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="The company profile is available to supplier accounts.">
      <CompanyContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  verRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  verBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  verText: { fontSize: 12, fontWeight: "700" },
  readOnly: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.neutralLight, marginTop: spacing.sm },
  cities: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  city: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cityActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  cityText: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },
  cityTextActive: { color: "#fff" },
  row: { flexDirection: "row", gap: spacing.md },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
});
