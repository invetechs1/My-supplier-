import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned under the scrolling body (e.g. an "Apply" button). */
  footer?: React.ReactNode;
  /** Right side of the header (e.g. a "Reset" link). */
  headerRight?: React.ReactNode;
  /** Wrap the body in a ScrollView (default true). Pass false for FlatList bodies. */
  scroll?: boolean;
  maxHeight?: number | `${number}%`;
  bodyStyle?: ViewStyle;
}

/**
 * Modal bottom sheet shared by the marketplace flows (filters, save-to-list,
 * price alerts, write review, request return…). Tapping the backdrop closes it.
 */
export function BottomSheet({ visible, onClose, title, subtitle, children, footer, headerRight, scroll = true, maxHeight = "88%", bodyStyle }: BottomSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={["bottom"]} style={[styles.sheet, { maxHeight }]}>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>{title}</Text>
                {subtitle ? (
                  <Text style={typography.caption} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {headerRight}
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
          ) : null}
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, bodyStyle]}>
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.flexShrink, bodyStyle]}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  body: { padding: spacing.lg, paddingBottom: spacing.xl },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
});
