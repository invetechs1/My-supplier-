import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "@/theme";
import { Button } from "./Button";

export function LoadingView({ message, style }: { message?: string; style?: ViewStyle }) {
  return (
    <View style={[styles.center, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
  style,
}: {
  message: string;
  onRetry?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.center, style]}>
      <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button title="Retry" variant="outline" size="sm" onPress={onRetry} style={styles.btn} /> : null}
    </View>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  message,
  icon = "file-tray-outline",
  actionTitle,
  onAction,
  style,
}: {
  title?: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.center, style]}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} size="sm" onPress={onAction} style={styles.btn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, minHeight: 200 },
  title: { ...typography.h3, marginTop: spacing.md, textAlign: "center" },
  message: { ...typography.bodySmall, marginTop: spacing.xs, textAlign: "center" },
  btn: { marginTop: spacing.lg },
});
