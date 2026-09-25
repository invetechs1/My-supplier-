import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { SAUDI_CITIES, type Address, type AddressPayload } from "@mysupplier/shared";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { colors, spacing, typography } from "@/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { PickerField, PickerModal } from "./PickerModal";
import { TextField } from "./TextField";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

interface Props {
  visible: boolean;
  /** Address to edit; omit to create a new one. */
  address?: Address | null;
  onClose: () => void;
  onSaved: (address: Address) => void;
}

/** Create / edit a saved delivery address (shared by /addresses and checkout). */
export function AddressSheet({ visible, address, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [form, setForm] = useState<AddressPayload>({ label: "", recipient: "", phone: "", city: "", street: "", district: "", building: "", notes: "", isDefault: false });
  const [errors, setErrors] = useState<Partial<Record<keyof AddressPayload, string>>>({});
  const [cityOpen, setCityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErrors({});
    setError(null);
    setForm(
      address
        ? {
            label: address.label,
            recipient: address.recipient,
            phone: address.phone,
            city: address.city,
            district: address.district ?? "",
            street: address.street,
            building: address.building ?? "",
            notes: address.notes ?? "",
            isDefault: address.isDefault,
          }
        : { label: "", recipient: user?.name ?? "", phone: user?.phone ?? "", city: user?.company?.city ?? "", district: "", street: "", building: "", notes: "", isDefault: false },
    );
  }, [visible, address, user]);

  const set = <K extends keyof AddressPayload>(key: K, value: AddressPayload[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const next: typeof errors = {};
    if (form.label.trim().length < 2) next.label = t("addressLabel");
    if (form.recipient.trim().length < 2) next.recipient = t("recipient");
    if (form.phone.trim().length < 7) next.phone = t("phone");
    if (!form.city) next.city = t("selectCity");
    if (form.street.trim().length < 5) next.street = t("street");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setError(null);
    const payload: AddressPayload = {
      label: form.label.trim(),
      recipient: form.recipient.trim(),
      phone: form.phone.trim(),
      city: form.city,
      district: form.district?.trim() || null,
      street: form.street.trim(),
      building: form.building?.trim() || null,
      notes: form.notes?.trim() || null,
      isDefault: form.isDefault,
    };
    try {
      const saved = address ? await api.updateAddress(address.id, payload) : await api.createAddress(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={address ? t("editAddress") : t("addAddress")}>
      <TextField label={t("addressLabel")} value={form.label} onChangeText={(v) => set("label", v)} placeholder={t("addressLabelPlaceholder")} error={errors.label} maxLength={60} />
      <TextField label={t("recipient")} value={form.recipient} onChangeText={(v) => set("recipient", v)} error={errors.recipient} autoComplete="name" />
      <TextField label={t("phone")} value={form.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" placeholder="+9665XXXXXXXX" error={errors.phone} />
      <PickerField label={t("city")} value={form.city} placeholder={t("selectCity")} onPress={() => setCityOpen(true)} error={errors.city} />
      <TextField label={`${t("district")} (${t("optional")})`} value={form.district ?? ""} onChangeText={(v) => set("district", v)} />
      <TextField label={t("street")} value={form.street} onChangeText={(v) => set("street", v)} multiline error={errors.street} />
      <TextField label={`${t("building")} (${t("optional")})`} value={form.building ?? ""} onChangeText={(v) => set("building", v)} />
      <TextField label={`${t("addressNotes")} (${t("optional")})`} value={form.notes ?? ""} onChangeText={(v) => set("notes", v)} multiline />
      <View style={styles.switchRow}>
        <Text style={typography.body}>{t("setDefault")}</Text>
        <Switch value={Boolean(form.isDefault)} onValueChange={(v) => set("isDefault", v)} trackColor={{ true: colors.primary }} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={t("save")} size="lg" fullWidth loading={busy} onPress={() => void submit()} />
      <PickerModal visible={cityOpen} title={t("city")} options={CITY_OPTIONS} value={form.city} onSelect={(c) => set("city", c)} onClose={() => setCityOpen(false)} searchable />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, marginBottom: spacing.md },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
});
