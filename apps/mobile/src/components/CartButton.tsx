import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCart } from "@/lib/cart";
import { colors, radius } from "@/theme";

interface CartButtonProps {
  /** Icon color; defaults to primary (use "#fff" on dark headers). */
  color?: string;
  size?: number;
  style?: ViewStyle;
}

/** Cart icon with a count badge – used in shop headers and the tab bar. */
export function CartBadge({ count, color = colors.primary, size = 22 }: { count: number; color?: string; size?: number }) {
  return (
    <View style={{ width: size + 6, height: size + 6, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={count > 0 ? "cart" : "cart-outline"} size={size} color={color} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function CartButton({ color = colors.primary, size = 22, style }: CartButtonProps) {
  const router = useRouter();
  const { count } = useCart();
  return (
    <Pressable onPress={() => router.push("/cart")} hitSlop={8} accessibilityLabel="Cart" style={[styles.btn, style]}>
      <CartBadge count={count} color={color} size={size} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: colors.text },
});
