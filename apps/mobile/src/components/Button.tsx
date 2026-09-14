import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle, TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/theme";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const bg: Record<Variant, string> = {
  primary: colors.primary,
  secondary: colors.primaryLight,
  outline: "transparent",
  ghost: "transparent",
  danger: colors.danger,
  accent: colors.accent,
};
const fg: Record<Variant, string> = {
  primary: "#fff",
  secondary: colors.primary,
  outline: colors.primary,
  ghost: colors.primary,
  danger: "#fff",
  accent: colors.text,
};
const heights: Record<Size, number> = { sm: 34, md: 44, lg: 52 };
const fontSizes: Record<Size, number> = { sm: 13, md: 15, lg: 16 };

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  fullWidth = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          height: heights[size],
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: colors.primary,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "auto",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={fontSizes[size] + 3} color={fg[variant]} style={styles.icon} /> : null}
          <Text style={[styles.text, { color: fg[variant], fontSize: fontSizes[size] }, textStyle]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  text: { fontWeight: "600" },
  icon: { marginRight: spacing.sm },
});
