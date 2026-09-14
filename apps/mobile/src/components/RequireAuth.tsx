import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import type { Role } from "@mysupplier/shared";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { colors, spacing, typography } from "@/theme";
import { Button } from "./Button";
import { LoadingView } from "./States";

interface Props {
  children: React.ReactNode;
  /** When given, only these roles may see the content (ADMIN always allowed). */
  roles?: Role[];
  message?: string;
}

/**
 * Gate for screens/actions that need an account. Browsing stays public;
 * this shows a friendly login prompt (not a hard redirect) so users keep
 * their place and come back after logging in.
 */
export function RequireAuth({ children, roles, message }: Props) {
  const { loading, isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  if (loading) return <LoadingView />;

  if (!isAuthenticated || !user) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={40} color={colors.primary} />
        <Text style={styles.title}>{t("loginRequired")}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Button
          title={t("login")}
          onPress={() => router.push({ pathname: "/(auth)/login", params: { redirect: pathname } })}
          style={styles.btn}
        />
        <Button
          title={t("register")}
          variant="ghost"
          onPress={() => router.push({ pathname: "/(auth)/register", params: { redirect: pathname } })}
        />
      </View>
    );
  }

  if (roles && user.role !== "ADMIN" && !roles.includes(user.role)) {
    return (
      <View style={styles.center}>
        <Ionicons name="ban-outline" size={40} color={colors.textMuted} />
        <Text style={styles.title}>Not available for your account</Text>
        <Text style={styles.message}>
          This section is for {roles.map((r) => r.toLowerCase()).join(" / ")} accounts.
        </Text>
        <Button title="Go back" variant="outline" onPress={() => router.back()} style={styles.btn} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.background },
  title: { ...typography.h3, marginTop: spacing.md, textAlign: "center" },
  message: { ...typography.bodySmall, marginTop: spacing.xs, textAlign: "center" },
  btn: { marginTop: spacing.lg, marginBottom: spacing.sm, minWidth: 200 },
});
