import React, { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Screen, Button, Card, SectionHeader, TextField, KeyValue, RequireAuth } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { phoneVerifiedOf, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatSaudiMobile, normalizeSaudiMobile } from "@/lib/phone";
import { colors, radius, spacing, typography } from "@/theme";

const RESEND_SECONDS = 60;

function confirm(title: string, message: string, confirmText: string, onConfirm: () => void, destructive = false) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof globalThis.confirm === "function" && globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmText, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}

function AccountContent() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, setUser, logout } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [deleting, setDeleting] = useState(false);

  // Phone verification (OTP purpose VERIFY_PHONE -> POST /auth/phone/verify)
  const phoneVerified = phoneVerifiedOf(user);
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMsg, setOtpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const sendVerifyCode = async () => {
    const normalized = normalizeSaudiMobile(phone);
    if (!normalized) {
      setOtpMsg({ ok: false, text: "Enter a valid Saudi mobile number (05xxxxxxxx) above and save it first" });
      return;
    }
    setOtpBusy(true);
    setOtpMsg(null);
    try {
      // Make sure the number on the account is the one being verified.
      if ((user?.phone ?? "") !== normalized) {
        const updated = await api.updateMe({ phone: normalized });
        setUser(updated);
        setPhone(normalized);
      }
      const res = await api.otpRequest({ phone: normalized, purpose: "VERIFY_PHONE" });
      setOtpSent(true);
      setOtpCode("");
      setCountdown(RESEND_SECONDS);
      setOtpHint(res.devCode ? `Development code: ${res.devCode}` : `Code sent via ${res.channel} to ${formatSaudiMobile(normalized)}`);
    } catch (err) {
      setOtpMsg({ ok: false, text: getErrorMessage(err) });
    } finally {
      setOtpBusy(false);
    }
  };

  const confirmVerifyCode = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpMsg({ ok: false, text: t("enterCode") });
      return;
    }
    setOtpBusy(true);
    setOtpMsg(null);
    try {
      const updated = await api.verifyPhone(otpCode);
      setUser(updated);
      setOtpSent(false);
      setOtpCode("");
      setOtpMsg({ ok: true, text: t("phoneVerified") });
    } catch (err) {
      setOtpMsg({ ok: false, text: getErrorMessage(err) });
    } finally {
      setOtpBusy(false);
    }
  };

  const saveProfile = async () => {
    if (name.trim().length < 2) {
      setProfileMsg({ ok: false, text: "Enter your name" });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const updated = await api.updateMe({ name: name.trim(), phone: phone.trim() || undefined });
      setUser(updated);
      setProfileMsg({ ok: true, text: "Profile updated" });
    } catch (err) {
      setProfileMsg({ ok: false, text: getErrorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword) return setPasswordMsg({ ok: false, text: "Enter your current password" });
    if (newPassword.length < 8) return setPasswordMsg({ ok: false, text: "New password must be at least 8 characters" });
    if (newPassword !== confirmPassword) return setPasswordMsg({ ok: false, text: "Passwords do not match" });
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ ok: true, text: "Password changed" });
    } catch (err) {
      setPasswordMsg({ ok: false, text: getErrorMessage(err) });
    } finally {
      setSavingPassword(false);
    }
  };

  const deleteAccount = () =>
    confirm(
      t("deleteAccount"),
      "Your account will be deactivated and you will be logged out. Open RFQs and orders stay visible to their counterparties for record keeping. This cannot be undone from the app.",
      "Delete",
      async () => {
        setDeleting(true);
        try {
          await api.deleteAccount();
          await logout();
          router.replace("/(tabs)/shop");
        } catch (err) {
          setDeleting(false);
          if (Platform.OS === "web") setProfileMsg({ ok: false, text: getErrorMessage(err) });
          else Alert.alert("Error", getErrorMessage(err));
        }
      },
      true,
    );

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: t("accountSettings") }} />

      <SectionHeader title={t("profile")} />
      <Card>
        <KeyValue label="Email" value={user?.email ?? ""} />
        <KeyValue label="Role" value={user?.role ?? ""} />
        <View style={{ height: spacing.md }} />
        <TextField label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="+9665XXXXXXXX"
          right={
            phoneVerified && phone === (user?.phone ?? "") ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.verifiedText}>{t("verified")}</Text>
              </View>
            ) : undefined
          }
        />
        {profileMsg ? <Text style={[styles.msg, { color: profileMsg.ok ? colors.success : colors.danger }]}>{profileMsg.text}</Text> : null}
        <Button title={t("save")} onPress={saveProfile} loading={savingProfile} fullWidth />
      </Card>

      <SectionHeader title={t("verifyPhone")} />
      <Card>
        {phoneVerified && !otpSent ? (
          <View style={styles.verifiedRow}>
            <Ionicons name="shield-checkmark" size={22} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { fontWeight: "600" }]}>{t("phoneVerified")}</Text>
              <Text style={typography.caption}>{formatSaudiMobile(user?.phone)} · suppliers and drivers can reach you on this number</Text>
            </View>
          </View>
        ) : (
          <Text style={typography.bodySmall}>Verify your mobile number to log in with a one-time code and receive delivery updates by SMS.</Text>
        )}
        {otpSent ? (
          <>
            <TextField
              label={t("enterCode")}
              value={otpCode}
              onChangeText={(v) => setOtpCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="••••••"
              hint={otpHint ?? undefined}
              containerStyle={{ marginTop: spacing.md }}
            />
            {otpMsg ? <Text style={[styles.msg, { color: otpMsg.ok ? colors.success : colors.danger }]}>{otpMsg.text}</Text> : null}
            <Button title={t("verify")} onPress={confirmVerifyCode} loading={otpBusy} fullWidth />
            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={typography.caption}>
                  {t("resend")} in {countdown}s
                </Text>
              ) : (
                <Pressable onPress={sendVerifyCode} disabled={otpBusy} hitSlop={6}>
                  <Text style={styles.link}>{t("resend")}</Text>
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <>
            {otpMsg ? <Text style={[styles.msg, { color: otpMsg.ok ? colors.success : colors.danger, marginTop: spacing.sm }]}>{otpMsg.text}</Text> : null}
            {!phoneVerified || phone !== (user?.phone ?? "") ? (
              <Button title={t("verifyPhone")} icon="chatbubble-ellipses-outline" variant={phoneVerified ? "outline" : "primary"} onPress={sendVerifyCode} loading={otpBusy} fullWidth style={{ marginTop: spacing.md }} />
            ) : null}
          </>
        )}
      </Card>

      <SectionHeader title={t("changePassword")} />
      <Card>
        <TextField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" textContentType="password" />
        <TextField label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" textContentType="newPassword" hint="At least 8 characters" />
        <TextField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" textContentType="newPassword" />
        {passwordMsg ? <Text style={[styles.msg, { color: passwordMsg.ok ? colors.success : colors.danger }]}>{passwordMsg.text}</Text> : null}
        <Button title={t("changePassword")} variant="secondary" onPress={savePassword} loading={savingPassword} fullWidth />
      </Card>

      <SectionHeader title="Danger zone" />
      <Card>
        <Text style={typography.bodySmall}>
          Deleting your account deactivates it immediately and removes your device from notifications. Contact support@mysupplier.sa to restore it within 30 days.
        </Text>
        <Button title={t("deleteAccount")} variant="danger" icon="trash-outline" onPress={deleteAccount} loading={deleting} fullWidth style={{ marginTop: spacing.md }} />
      </Card>
    </Screen>
  );
}

export default function AccountScreen() {
  return (
    <RequireAuth>
      <AccountContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  msg: { ...typography.bodySmall, marginBottom: spacing.sm, fontWeight: "600" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  verifiedText: { fontSize: 11, fontWeight: "700", color: colors.success },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  resendRow: { alignItems: "center", marginTop: spacing.md },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
});
