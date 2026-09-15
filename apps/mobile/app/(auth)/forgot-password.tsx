import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen, Button, TextField } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { colors, spacing, typography } from "@/theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setError("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.forgotPassword(value);
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Screen scroll edges={["bottom", "left", "right"]}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-open-outline" size={34} color={colors.primary} />
          </View>
          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.sub}>{t("resetLinkSent")}</Text>
          <Text style={[typography.caption, { textAlign: "center", marginTop: spacing.sm }]}>
            The link expires after 1 hour. Open it on this device or on the web to choose a new password.
          </Text>
        </View>
        <Button title="Back to log in" size="lg" fullWidth onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="key-outline" size={34} color={colors.primary} />
        </View>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.sub}>Enter the email you registered with and we will send you a reset link.</Text>
      </View>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@company.sa"
        onSubmitEditing={onSubmit}
        error={error}
      />
      <Button title="Send reset link" onPress={onSubmit} loading={submitting} fullWidth size="lg" />
      <Button title="Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xxl, alignItems: "center" },
  iconWrap: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  title: { ...typography.h2, textAlign: "center" },
  sub: { ...typography.bodySmall, textAlign: "center", marginTop: spacing.sm, maxWidth: 300 },
});
