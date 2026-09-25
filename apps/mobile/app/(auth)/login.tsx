import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { SAUDI_CITIES, type CompanyType, type OtpRequestResult, type OtpVerifyPayload, type User } from "@mysupplier/shared";
import { Screen, Button, TextField, PickerField, PickerModal } from "@/components";
import { safeRedirect, useAuth } from "@/lib/auth";
import { api, ApiRequestError, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { normalizeSaudiMobile, formatSaudiMobile } from "@/lib/phone";
import { colors, radius, spacing, typography } from "@/theme";

type Mode = "email" | "phone";
const RESEND_SECONDS = 60;

const COMPANY_TYPES: Array<{ value: CompanyType; label: string }> = [
  { value: "SUPPLIER", label: "Supplier / Distributor" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "CONSULTANT", label: "Consultant" },
  { value: "OTHER", label: "Other" },
];
const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

/** The API answers 400/404 when the phone has no account yet and `name` is missing. */
function isNewPhoneError(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) return false;
  if (err.status === 404) return true;
  return err.status === 400 && /name|new|not found|no account|register|sign ?up|create/i.test(err.message);
}

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { redirect: rawRedirect, mode: initialMode } = useLocalSearchParams<{ redirect?: string; mode?: string }>();
  const redirect = safeRedirect(rawRedirect);
  const { login, loginWithToken } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode === "phone" ? "phone" : "email");

  // Email + password
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mobile OTP
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null); // E.164 once a code was sent
  const [otp, setOtp] = useState<OtpRequestResult | null>(null);
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [name, setName] = useState("");
  const [isSupplier, setIsSupplier] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyType, setCompanyType] = useState<CompanyType>("SUPPLIER");
  const [city, setCity] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const autoVerified = useRef(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  /** After login: return to where the user came from, else land suppliers on their dashboard. */
  const finish = useCallback(
    (user?: User) => {
      if (router.canGoBack()) router.back();
      const target = redirect && redirect !== "/(auth)/login" ? redirect : user?.role === "SUPPLIER" ? "/supplier/dashboard" : null;
      // Replace so the login modal is not left in history.
      if (target) setTimeout(() => router.replace(target as never), 0);
    },
    [redirect, router],
  );

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const user = await login({ email: email.trim().toLowerCase(), password });
      finish(user);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (role: "buyer" | "supplier") => {
    setEmail(`${role}@mysupplier.sa`);
    setPassword(role === "buyer" ? "Buyer123!" : "Supplier123!");
  };

  const sendCode = async () => {
    const normalized = normalizeSaudiMobile(phoneInput);
    if (!normalized) {
      setOtpError("Enter a valid Saudi mobile number (05xxxxxxxx)");
      return;
    }
    setSending(true);
    setOtpError(null);
    try {
      const res = await api.otpRequest({ phone: normalized, purpose: "LOGIN" });
      setPhone(normalized);
      setOtp(res);
      setCode("");
      autoVerified.current = false;
      setCountdown(RESEND_SECONDS);
    } catch (err) {
      setOtpError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const verifyCode = useCallback(async () => {
    if (!phone) return;
    if (!/^\d{6}$/.test(code)) {
      setOtpError(t("enterCode"));
      return;
    }
    if (needsProfile) {
      if (name.trim().length < 2) return setOtpError("Enter your name to create the account");
      if (isSupplier && !companyName.trim()) return setOtpError("Company name is required");
      if (isSupplier && !city) return setOtpError("Select your company city");
    }
    setVerifying(true);
    setOtpError(null);
    const payload: OtpVerifyPayload = { phone, code };
    if (needsProfile) {
      payload.name = name.trim();
      payload.role = isSupplier ? "SUPPLIER" : "BUYER";
      if (isSupplier) payload.company = { name: companyName.trim(), type: companyType, city };
    }
    try {
      const res = await api.otpVerify(payload);
      const user = await loginWithToken(res.token, res.user);
      finish(user);
    } catch (err) {
      if (!needsProfile && isNewPhoneError(err)) {
        setNeedsProfile(true);
        setOtpError(null);
      } else {
        setOtpError(getErrorMessage(err));
      }
    } finally {
      setVerifying(false);
    }
  }, [phone, code, needsProfile, name, isSupplier, companyName, city, companyType, loginWithToken, finish, t]);

  // Verify as soon as 6 digits are typed (once per code), unless we still need the name.
  useEffect(() => {
    if (needsProfile || autoVerified.current || !phone || !/^\d{6}$/.test(code)) return;
    autoVerified.current = true;
    void verifyCode();
  }, [code, phone, needsProfile, verifyCode]);

  const changeNumber = () => {
    setPhone(null);
    setOtp(null);
    setCode("");
    setNeedsProfile(false);
    setOtpError(null);
    setCountdown(0);
  };

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <View style={styles.hero}>
        <Text style={styles.logo}>MySupplier</Text>
        <Text style={styles.brandTagline}>{t("brandTagline")}</Text>
        <Text style={styles.tagline}>Build for less — live building-material prices, RFQs and bids across Saudi Arabia</Text>
      </View>

      <View style={styles.segment} accessibilityRole="tablist">
        {(["email", "phone"] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.segmentItem, active && styles.segmentItemActive]}>
              <Ionicons name={m === "email" ? "mail-outline" : "phone-portrait-outline"} size={16} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m === "email" ? t("email") : t("mobile")}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === "email" ? (
        <>
          <TextField
            label={t("email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="you@company.sa"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textContentType="password"
            placeholder="••••••••"
            onSubmitEditing={onSubmit}
            right={
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                <Text style={styles.toggle}>{showPassword ? "Hide" : "Show"}</Text>
              </Pressable>
            }
            error={error}
          />

          <Pressable onPress={() => router.push({ pathname: "/(auth)/forgot-password", params: email ? { email } : {} })} style={styles.forgot} hitSlop={6}>
            <Text style={styles.link}>{t("forgotPassword")}</Text>
          </Pressable>

          <Button title={t("login")} onPress={onSubmit} loading={submitting} fullWidth size="lg" />

          <View style={styles.demoRow}>
            <Text style={typography.caption}>Demo accounts:</Text>
            <Pressable onPress={() => fillDemo("buyer")} hitSlop={6}>
              <Text style={styles.demoLink}>Buyer</Text>
            </Pressable>
            <Pressable onPress={() => fillDemo("supplier")} hitSlop={6}>
              <Text style={styles.demoLink}>Supplier</Text>
            </Pressable>
          </View>
        </>
      ) : !phone ? (
        <>
          <TextField
            label={t("mobileNumber")}
            value={phoneInput}
            onChangeText={setPhoneInput}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="05xxxxxxxx"
            hint="We will text you a 6-digit code. Works for new and existing accounts."
            onSubmitEditing={sendCode}
            error={otpError}
          />
          <Button title={t("sendCode")} icon="chatbubble-ellipses-outline" onPress={sendCode} loading={sending} fullWidth size="lg" />
        </>
      ) : (
        <>
          <View style={styles.sentRow}>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodySmall}>Code sent to</Text>
              <Text style={styles.sentPhone}>{formatSaudiMobile(phone)}</Text>
            </View>
            <Pressable onPress={changeNumber} hitSlop={6}>
              <Text style={styles.link}>Change</Text>
            </Pressable>
          </View>

          <TextField
            label={t("enterCode")}
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, "").slice(0, 6));
              if (v.length < 6) autoVerified.current = false;
            }}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder="••••••"
            style={styles.codeInput}
            autoFocus
            error={otpError}
            hint={otp?.devCode ? `Development code: ${otp.devCode}` : otp ? `Code expires in ${Math.max(1, Math.round(otp.expiresInSeconds / 60))} min · via ${otp.channel}` : undefined}
          />

          {needsProfile ? (
            <View style={styles.newBox}>
              <View style={styles.newHead}>
                <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                <Text style={styles.newTitle}>New number — create your account</Text>
              </View>
              <TextField label="Full name" value={name} onChangeText={setName} placeholder="Ahmed Al-Qahtani" autoComplete="name" textContentType="name" />
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>I'm a supplier</Text>
                  <Text style={typography.caption}>List prices and bid on RFQs</Text>
                </View>
                <Switch value={isSupplier} onValueChange={setIsSupplier} trackColor={{ true: colors.primary }} />
              </View>
              {isSupplier ? (
                <>
                  <TextField label="Company name" value={companyName} onChangeText={setCompanyName} />
                  <PickerField label="Company type" value={COMPANY_TYPES.find((c) => c.value === companyType)?.label} onPress={() => setTypeOpen(true)} />
                  <PickerField label="City" value={city} placeholder="Select city" onPress={() => setCityOpen(true)} />
                </>
              ) : null}
            </View>
          ) : null}

          <Button title={needsProfile ? t("register") : t("verify")} onPress={verifyCode} loading={verifying} fullWidth size="lg" />

          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={typography.caption}>
                {t("resend")} in {countdown}s
              </Text>
            ) : (
              <Pressable onPress={sendCode} disabled={sending} hitSlop={6}>
                <Text style={styles.link}>{sending ? "Sending…" : t("resend")}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={styles.footer}>
        <Text style={typography.bodySmall}>New to MySupplier? </Text>
        <Link href={{ pathname: "/(auth)/register", params: redirect ? { redirect } : {} }} replace asChild>
          <Pressable hitSlop={6}>
            <Text style={styles.link}>{t("register")}</Text>
          </Pressable>
        </Link>
      </View>

      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
        style={styles.skip}
        hitSlop={8}
      >
        <Text style={styles.skipText}>Continue browsing without an account</Text>
      </Pressable>

      <PickerModal visible={cityOpen} title="Select city" options={CITY_OPTIONS} value={city} onSelect={setCity} onClose={() => setCityOpen(false)} searchable />
      <PickerModal visible={typeOpen} title="Company type" options={COMPANY_TYPES} value={companyType} onSelect={setCompanyType} onClose={() => setTypeOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl, alignItems: "center" },
  logo: { fontSize: 30, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 },
  brandTagline: { fontSize: 14, fontWeight: "700", color: colors.accent ?? "#D18F00", marginTop: 2, letterSpacing: 0.3 },
  tagline: { ...typography.bodySmall, textAlign: "center", marginTop: spacing.sm, maxWidth: 280 },
  segment: { flexDirection: "row", backgroundColor: colors.neutralLight, borderRadius: radius.md, padding: 3, marginBottom: spacing.lg },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: radius.sm },
  segmentItemActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  segmentTextActive: { color: colors.primary },
  toggle: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  demoRow: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginTop: spacing.lg, justifyContent: "center" },
  demoLink: { color: colors.primary, fontWeight: "600", fontSize: 12 },
  forgot: { alignSelf: "flex-end", marginTop: -spacing.xs, marginBottom: spacing.lg },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  skip: { alignItems: "center", marginTop: spacing.xl },
  skipText: { ...typography.caption, textDecorationLine: "underline" },
  sentRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  sentPhone: { ...typography.h3, marginTop: 2 },
  codeInput: { fontSize: 24, letterSpacing: 10, fontWeight: "700", textAlign: "center" },
  newBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  newHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  newTitle: { ...typography.h3, color: colors.primary },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  switchLabel: { ...typography.body, fontWeight: "600" },
  resendRow: { alignItems: "center", marginTop: spacing.md },
});
