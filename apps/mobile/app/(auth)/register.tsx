import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { CR_NUMBER_REGEX, SAUDI_CITIES, VAT_NUMBER_REGEX, citiesInRegionOf, isSaudiPhone, type CompanyType, type RegisterPayload } from "@mysupplier/shared";
import { Screen, Button, TextField, PickerField, PickerModal, Chip } from "@/components";
import { safeRedirect, useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { ApiRequestError, getErrorMessage, WEB_URL } from "@/lib/api";
import { colors, radius, spacing, typography } from "@/theme";

type RegRole = "BUYER" | "SUPPLIER";

/** Buyers pick how they build; suppliers are always SUPPLIER. */
const BUYER_TYPES: Array<{ value: CompanyType; label: TranslationKey }> = [
  { value: "CONTRACTOR", label: "regTypeContractor" },
  { value: "CONSULTANT", label: "regTypeConsultant" },
  { value: "OTHER", label: "regTypeOther" },
];

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));
const openLegal = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}${path}`).catch(() => undefined);

function Checkbox({ checked, onToggle, label, error, links }: { checked: boolean; onToggle: () => void; label: string; error?: string; links: Array<{ label: string; path: string }> }) {
  return (
    <View style={styles.checkRow}>
      <Pressable onPress={onToggle} style={styles.checkPress} accessibilityRole="checkbox" accessibilityState={{ checked }}>
        <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.primary : error ? colors.danger : colors.textMuted} />
        <Text style={styles.checkLabel}>{label}</Text>
      </Pressable>
      <View style={styles.linkRow}>
        {links.map((l) => (
          <Pressable key={l.path} onPress={() => openLegal(l.path)} hitSlop={6}>
            <Text style={styles.link}>{l.label} ↗</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const { redirect: rawRedirect } = useLocalSearchParams<{ redirect?: string }>();
  const redirect = safeRedirect(rawRedirect);
  const { register } = useAuth();
  const { t, locale } = useI18n();

  const [role, setRole] = useState<RegRole>("BUYER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companyNameAr, setCompanyNameAr] = useState("");
  const [companyType, setCompanyType] = useState<CompanyType>("CONTRACTOR");
  const [city, setCityState] = useState<string>("");
  const [crNumber, setCrNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [citiesServed, setCitiesServed] = useState<string[]>([]);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeSupplier, setAgreeSupplier] = useState(false);

  const [cityOpen, setCityOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const isSupplier = role === "SUPPLIER";

  /** The head-office city is always part of the delivery zone. */
  const setCity = (next: string) => {
    setCityState(next);
    setCitiesServed((list) => (list.includes(next) ? list : [...list, next]));
  };
  const toggleCity = (c: string) => setCitiesServed((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  const validate = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = t("regErrName");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t("regErrEmail");
    if (password.length < 8) next.password = t("regErrPassword");
    if (phone.trim() && !isSaudiPhone(phone.trim())) next.phone = t("regErrPhone");
    if (companyName.trim().length < 2) next.companyName = t("regErrCompanyName");
    if (!city) next.city = t("regErrCity");
    if (!CR_NUMBER_REGEX.test(crNumber.trim())) next.crNumber = t("regErrCr");
    if (!VAT_NUMBER_REGEX.test(vatNumber.trim())) next.vatNumber = t("regErrVat");
    if (!isSaudiPhone(companyPhone.trim())) next.companyPhone = t("regErrCompanyPhone");
    if (isSupplier && citiesServed.length === 0) next.citiesServed = t("regErrCities");
    if (!agreeTerms) next.agreeTerms = t("regErrTerms");
    if (isSupplier && !agreeSupplier) next.agreeSupplier = t("regErrSupplierAgreement");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    const payload: RegisterPayload = {
      email: email.trim().toLowerCase(),
      password,
      name: name.trim(),
      phone: phone.trim() || undefined,
      role,
      locale,
      company: {
        name: companyName.trim(),
        nameAr: companyNameAr.trim() || undefined,
        type: isSupplier ? "SUPPLIER" : companyType,
        city,
        crNumber: crNumber.trim(),
        vatNumber: vatNumber.trim(),
        phone: companyPhone.trim(),
        ...(isSupplier ? { citiesServed } : {}),
      },
      acceptTerms: true,
      ...(isSupplier ? { acceptSupplierAgreement: true as const } : {}),
    };
    try {
      await register(payload);
      if (router.canGoBack()) router.back();
      if (redirect) setTimeout(() => router.replace(redirect as never), 0);
    } catch (err) {
      setServerError(err instanceof ApiRequestError && err.status === 409 && /\bCR\b/.test(err.message) ? t("regErrCrDuplicate") : getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <Text style={styles.heading}>{t("regTitle")}</Text>
      <Text style={styles.sub}>{t("regSubtitle")}</Text>

      <View style={styles.roleRow}>
        {(["BUYER", "SUPPLIER"] as RegRole[]).map((r) => {
          const active = role === r;
          return (
            <Pressable key={r} onPress={() => setRole(r)} style={[styles.roleCard, active && styles.roleCardActive]}>
              <Text style={[styles.roleTitle, active && { color: colors.primary }]}>{r === "BUYER" ? t("regBuyer") : t("regSupplier")}</Text>
              <Text style={styles.roleDesc}>{r === "BUYER" ? t("regBuyerDesc") : t("regSupplierDesc")}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{t("regYourDetails")}</Text>
      <TextField label={t("regFullName")} value={name} onChangeText={setName} error={errors.name} placeholder="Ahmed Al-Qahtani" autoComplete="name" />
      <TextField label={t("regEmail")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} placeholder="you@company.sa" />
      <TextField label={t("regPhoneOptional")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05XXXXXXXX" error={errors.phone} />
      <TextField label={t("regPassword")} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" error={errors.password} hint={t("regPasswordHint")} />

      <View style={styles.companyBox}>
        <Text style={styles.companyTitle}>{t("regCompany")}</Text>
        <Text style={styles.companyHint}>{isSupplier ? t("regCompanyHintSupplier") : t("regCompanyHintBuyer")}</Text>
        <TextField label={t("regCompanyName")} value={companyName} onChangeText={setCompanyName} error={errors.companyName} autoComplete="organization" />
        <TextField label={t("regCompanyNameAr")} value={companyNameAr} onChangeText={setCompanyNameAr} />
        {isSupplier ? (
          <PickerField label={t("regCompanyType")} value={t("regTypeSupplier")} onPress={() => undefined} />
        ) : (
          <PickerField label={t("regCompanyType")} value={t(BUYER_TYPES.find((x) => x.value === companyType)?.label ?? "regTypeContractor")} onPress={() => setTypeOpen(true)} />
        )}
        <PickerField label={t("regCity")} value={city} placeholder={t("regSelectCity")} onPress={() => setCityOpen(true)} error={errors.city} />
        <TextField label={t("regCr")} value={crNumber} onChangeText={(v) => setCrNumber(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={10} placeholder="1010XXXXXX" error={errors.crNumber} hint={t("regCrHint")} />
        <TextField label={t("regVat")} value={vatNumber} onChangeText={(v) => setVatNumber(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={15} placeholder="3XXXXXXXXXXXXX3" error={errors.vatNumber} hint={t("regVatHint")} />
        <TextField label={t("regCompanyPhone")} value={companyPhone} onChangeText={setCompanyPhone} keyboardType="phone-pad" placeholder="05XXXXXXXX" error={errors.companyPhone} hint={t("regCompanyPhoneHint")} />

        {isSupplier ? (
          <View style={styles.zone}>
            <Text style={styles.zoneLabel}>{t("regServiceArea")}</Text>
            <View style={styles.zoneActions}>
              <Pressable onPress={() => city && setCitiesServed([...new Set([...citiesServed, ...citiesInRegionOf(city)])])} hitSlop={6}><Text style={styles.link}>{t("regSameRegion")}</Text></Pressable>
              <Pressable onPress={() => setCitiesServed([...SAUDI_CITIES])} hitSlop={6}><Text style={styles.link}>{t("regSelectAll")}</Text></Pressable>
              <Pressable onPress={() => setCitiesServed(city ? [city] : [])} hitSlop={6}><Text style={[styles.link, { color: colors.textSecondary }]}>{t("regClear")}</Text></Pressable>
            </View>
            <View style={styles.chips}>
              {SAUDI_CITIES.map((c) => <Chip key={c} label={c} active={citiesServed.includes(c)} onPress={() => toggleCity(c)} />)}
            </View>
            <Text style={[styles.zoneHint, errors.citiesServed ? { color: colors.danger } : null]}>{errors.citiesServed ?? `${citiesServed.length} ${t("regCitiesSelected")} – ${t("regServiceAreaHint")}`}</Text>
          </View>
        ) : null}
      </View>

      <Checkbox checked={agreeTerms} onToggle={() => setAgreeTerms((v) => !v)} label={t("regAgreeTerms")} error={errors.agreeTerms} links={[{ label: t("regTerms"), path: "/terms" }, { label: t("regPrivacy"), path: "/privacy" }]} />
      {isSupplier ? <Checkbox checked={agreeSupplier} onToggle={() => setAgreeSupplier((v) => !v)} label={t("regAgreeSupplier")} error={errors.agreeSupplier} links={[{ label: t("regSupplierAgreement"), path: "/supplier-agreement" }]} /> : null}

      {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

      <Button title={t("regCreate")} onPress={onSubmit} loading={submitting} fullWidth size="lg" />

      <Link href={{ pathname: "/(auth)/login", params: { mode: "phone", ...(redirect ? { redirect } : {}) } }} replace asChild>
        <Pressable style={styles.mobileLink} hitSlop={6}>
          <Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />
          <Text style={styles.link}>{t("signUpWithMobile")}</Text>
        </Pressable>
      </Link>

      <View style={styles.footer}>
        <Text style={typography.bodySmall}>{t("regAlready")} </Text>
        <Link href={{ pathname: "/(auth)/login", params: redirect ? { redirect } : {} }} replace asChild>
          <Pressable hitSlop={6}>
            <Text style={styles.link}>{t("regLogin")}</Text>
          </Pressable>
        </Link>
      </View>

      <PickerModal visible={cityOpen} title={t("regSelectCity")} options={CITY_OPTIONS} value={city} onSelect={setCity} onClose={() => setCityOpen(false)} searchable />
      <PickerModal visible={typeOpen} title={t("regCompanyType")} options={BUYER_TYPES.map((x) => ({ value: x.value, label: t(x.label) }))} value={companyType} onSelect={setCompanyType} onClose={() => setTypeOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.h1, marginTop: spacing.xl },
  sub: { ...typography.bodySmall, marginBottom: spacing.lg, marginTop: spacing.xs },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  roleRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  roleCard: { flex: 1, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  roleCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleTitle: { ...typography.h3 },
  roleDesc: { ...typography.caption, marginTop: 4 },
  companyBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  companyTitle: { ...typography.h3 },
  companyHint: { ...typography.caption, marginBottom: spacing.md, marginTop: 2 },
  zone: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  zoneLabel: { ...typography.label, marginBottom: spacing.xs },
  zoneActions: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  zoneHint: { ...typography.caption, marginTop: spacing.sm },
  checkRow: { marginBottom: spacing.md },
  checkPress: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  checkLabel: { ...typography.body, flex: 1, fontSize: 14 },
  linkRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs, marginStart: 30 },
  fieldError: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, marginStart: 30 },
  serverError: { color: colors.danger, marginBottom: spacing.md, fontSize: 13 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  mobileLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md, paddingVertical: spacing.sm },
});
