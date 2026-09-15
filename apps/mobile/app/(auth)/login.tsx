import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Screen, Button, TextField } from "@/components";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/api";
import { colors, spacing, typography } from "@/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    if (router.canGoBack()) router.back();
    if (redirect && redirect !== "/(auth)/login") {
      // Replace so the login modal is not left in history.
      setTimeout(() => router.replace(redirect as never), 0);
    }
  };

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim().toLowerCase(), password });
      finish();
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

  return (
    <Screen scroll keyboard edges={["bottom", "left", "right"]}>
      <View style={styles.hero}>
        <Text style={styles.logo}>MySupplier</Text>
        <Text style={styles.tagline}>Building-materials prices, RFQs and bids across Saudi Arabia</Text>
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
        <Text style={styles.link}>Forgot password?</Text>
      </Pressable>

      <Button title="Log in" onPress={onSubmit} loading={submitting} fullWidth size="lg" />

      <View style={styles.demoRow}>
        <Text style={typography.caption}>Demo accounts:</Text>
        <Pressable onPress={() => fillDemo("buyer")} hitSlop={6}>
          <Text style={styles.demoLink}>Buyer</Text>
        </Pressable>
        <Pressable onPress={() => fillDemo("supplier")} hitSlop={6}>
          <Text style={styles.demoLink}>Supplier</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={typography.bodySmall}>New to MySupplier? </Text>
        <Link href={{ pathname: "/(auth)/register", params: redirect ? { redirect } : {} }} replace asChild>
          <Pressable hitSlop={6}>
            <Text style={styles.link}>Create an account</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xxl, alignItems: "center" },
  logo: { fontSize: 30, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 },
  tagline: { ...typography.bodySmall, textAlign: "center", marginTop: spacing.sm, maxWidth: 280 },
  toggle: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  demoRow: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginTop: spacing.lg, justifyContent: "center" },
  demoLink: { color: colors.primary, fontWeight: "600", fontSize: 12 },
  forgot: { alignSelf: "flex-end", marginTop: -spacing.xs, marginBottom: spacing.lg },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  skip: { alignItems: "center", marginTop: spacing.xl },
  skipText: { ...typography.caption, textDecorationLine: "underline" },
});
