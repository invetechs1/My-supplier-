import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "@/theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  containerStyle?: ViewStyle;
  right?: React.ReactNode;
}

export function TextField({ label, error, hint, containerStyle, right, style, multiline, ...rest }: TextFieldProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrap, error ? styles.inputError : null, multiline ? styles.multiline : null]}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, multiline ? styles.inputMultiline : null, style]}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.label, marginBottom: spacing.xs },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  multiline: { minHeight: 96, alignItems: "flex-start", paddingVertical: spacing.sm },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  inputMultiline: { minHeight: 80 },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  hint: { ...typography.caption, marginTop: spacing.xs },
});
