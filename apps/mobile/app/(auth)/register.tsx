import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { SAUDI_CITIES, type CompanyType, type RegisterPayload } from "@mysupplier/shared";
import { Screen, Button, TextField, PickerField, PickerModal } from "@/components";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getErrorMessage } from "@/lib/api";
import { colors, radius, spacing, typography } from "@/theme";

type RegRole = "BUYER" | "SUPPLIER";

const COMPANY_TYPES: Array<{ value: CompanyType; label: string }> = [
  { value: "SUPPLIER", label: "Supplier / Distributor" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "CONSULTANT", label: "Consultant" },
  { value: "OTHER", label: "Other" },
];

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

export default function RegisterScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { register } = useAuth();
  const { t } = useI18n();

  const [role, setRole] = useState<RegRole>("BUYER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companyType, setCompanyType] = useState<CompanyType>("SUPPLIER");
  const [city, setCity] = useState<string>("");
  const [crNumber, setCrNumber] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  const [cityOpen, setCityOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Your name is required";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email";
    if (password.length < 8) next.password = "At least 8 characters";
    if (role === "SUPPLIER") {
      if (!companyName.trim()) next.companyName = "Company name is required";
      if (!city) next.city = "Select a city";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    const payload: RegisterPayload = {
      email: email.trim().toLowerCase(),
      password,
      name: name.trim(),
      phone: phone.trim() || undefined,
      role,
      locale: "en",
    };
    if (role === "SUPPLIER") {
      payload.company = {
        name: companyName.trim(),
        type: companyType,
        city,
        crNumber: crNumber.trim() || undefined,
        phone: companyPhone.trim() || undefined,
      };
    }
    try {
      await register(payload);
      if (router.canGoBack()) router.back();
      if (redirect) setTimeout(() => router.replace(redirect as never), 0);
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <Text style={styles.heading}>Join MySupplier</Text>
      <Text style={styles.sub}>Choose how you will use the platform.</Text>

      <View style={styles.roleRow}>
        {(["BUYER", "SUPPLIER"] as RegRole[]).map((r) => {
          const active = role === r;
          return (
            <Pressable key={r} onPress={() => setRole(r)} style={[styles.roleCard, active && styles.roleCardActive]}>
              <Text style={[styles.roleTitle, active && { color: colors.primary }]}>
                {r === "BUYER" ? "Buyer" : "Supplier"}
              </Text>
              <Text style={styles.roleDesc}>
                {r === "BUYER" ? "Compare prices and request quotes" : "List prices and bid on RFQs"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField label="Full name" value={name} onChangeText={setName} error={errors.name} placeholder="Ahmed Al-Qahtani" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        error={errors.email}
        placeholder="you@company.sa"
      />
      <TextField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+9665XXXXXXXX" />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        error={errors.password}
        hint="Minimum 8 characters"
      />

      {role === "SUPPLIER" ? (
        <View style={styles.companyBox}>
          <Text style={styles.companyTitle}>Company details</Text>
          <TextField label="Company name" value={companyName} onChangeText={setCompanyName} error={errors.companyName} />
          <PickerField
            label="Company type"
            value={COMPANY_TYPES.find((t) => t.value === companyType)?.label}
            onPress={() => setTypeOpen(true)}
          />
          <PickerField label="City" value={city} placeholder="Select city" onPress={() => setCityOpen(true)} error={errors.city} />
          <TextField label="CR number (optional)" value={crNumber} onChangeText={setCrNumber} keyboardType="number-pad" />
          <TextField label="Company phone (optional)" value={companyPhone} onChangeText={setCompanyPhone} keyboardType="phone-pad" />
        </View>
      ) : null}

      {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

      <Button title="Create account" onPress={onSubmit} loading={submitting} fullWidth size="lg" />

      <Link href={{ pathname: "/(auth)/login", params: { mode: "phone", ...(redirect ? { redirect } : {}) } }} replace asChild>
        <Pressable style={styles.mobileLink} hitSlop={6}>
          <Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />
          <Text style={styles.link}>{t("signUpWithMobile")}</Text>
        </Pressable>
      </Link>

      <View style={styles.footer}>
        <Text style={typography.bodySmall}>Already have an account? </Text>
        <Link href={{ pathname: "/(auth)/login", params: redirect ? { redirect } : {} }} replace asChild>
          <Pressable hitSlop={6}>
            <Text style={styles.link}>Log in</Text>
          </Pressable>
        </Link>
      </View>

      <PickerModal
        visible={cityOpen}
        title="Select city"
        options={CITY_OPTIONS}
        value={city}
        onSelect={setCity}
        onClose={() => setCityOpen(false)}
        searchable
      />
      <PickerModal
        visible={typeOpen}
        title="Company type"
        options={COMPANY_TYPES}
        value={companyType}
        onSelect={setCompanyType}
        onClose={() => setTypeOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.h1, marginTop: spacing.xl },
  sub: { ...typography.bodySmall, marginBottom: spacing.lg, marginTop: spacing.xs },
  roleRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  roleCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleTitle: { ...typography.h3 },
  roleDesc: { ...typography.caption, marginTop: 4 },
  companyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  companyTitle: { ...typography.h3, marginBottom: spacing.md },
  serverError: { color: colors.danger, marginBottom: spacing.md, fontSize: 13 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  mobileLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md, paddingVertical: spacing.sm },
});
