import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/theme";

interface QtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number | null;
  step?: number;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: ViewStyle;
}

/** - [ qty ] + control. Clamps to min/max and commits typed values on blur. */
export function QtyStepper({ value, onChange, min = 1, max = null, step = 1, disabled = false, size = "md", style }: QtyStepperProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const clamp = (n: number) => {
    let next = Math.max(min, Math.round(n));
    if (max !== null && max !== undefined) next = Math.min(next, max);
    return next;
  };
  const commit = (n: number) => {
    const next = clamp(n);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const h = size === "sm" ? 30 : 38;
  const canDec = !disabled && value > min;
  const canInc = !disabled && (max === null || max === undefined || value < max);

  return (
    <View style={[styles.wrap, { height: h }, disabled && { opacity: 0.6 }, style]}>
      <Pressable onPress={() => commit(value - step)} disabled={!canDec} hitSlop={6} style={[styles.btn, { width: h }]} accessibilityLabel="Decrease quantity">
        <Ionicons name="remove" size={size === "sm" ? 16 : 18} color={canDec ? colors.primary : colors.textMuted} />
      </Pressable>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.replace(/[^0-9]/g, ""))}
        onBlur={() => commit(Number(text) || min)}
        onSubmitEditing={() => commit(Number(text) || min)}
        keyboardType="number-pad"
        editable={!disabled}
        selectTextOnFocus
        style={[styles.input, size === "sm" && { fontSize: 13, minWidth: 34 }]}
      />
      <Pressable onPress={() => commit(value + step)} disabled={!canInc} hitSlop={6} style={[styles.btn, { width: h }]} accessibilityLabel="Increase quantity">
        <Ionicons name="add" size={size === "sm" ? 16 : 18} color={canInc ? colors.primary : colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  btn: { height: "100%", alignItems: "center", justifyContent: "center" },
  input: { minWidth: 44, textAlign: "center", fontSize: 15, fontWeight: "700", color: colors.text, paddingVertical: 0 },
});
