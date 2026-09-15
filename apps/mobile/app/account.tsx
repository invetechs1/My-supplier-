import React, { useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Screen, Button, Card, SectionHeader, TextField, KeyValue, RequireAuth } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { colors, spacing, typography } from "@/theme";

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
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+9665XXXXXXXX" />
        {profileMsg ? <Text style={[styles.msg, { color: profileMsg.ok ? colors.success : colors.danger }]}>{profileMsg.text}</Text> : null}
        <Button title={t("save")} onPress={saveProfile} loading={savingProfile} fullWidth />
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
});
