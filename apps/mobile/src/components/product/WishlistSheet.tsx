import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Wishlist } from "@mysupplier/shared";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { colors, radius, spacing, typography } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { TextField } from "../TextField";

interface Props {
  visible: boolean;
  materialId: string;
  quantity?: number;
  listingId?: string | null;
  /** Lists that already contain the product (from GET /wishlists/contains). */
  containedIn: string[];
  onClose: () => void;
  /** Called after the product was added to / removed from a list (with the updated membership). */
  onChanged: (wishlistIds: string[]) => void;
}

/** "Save to list": pick one of the buyer's lists (or create one) to add the product to. */
export function WishlistSheet({ visible, materialId, quantity, listingId, containedIn, onClose, onChanged }: Props) {
  const { t } = useI18n();
  const [lists, setLists] = useState<Wishlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setError(null);
    api
      .wishlists()
      .then((res) => {
        if (!cancelled) setLists(res);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const toggle = async (list: Wishlist) => {
    setBusy(list.id);
    setError(null);
    try {
      if (containedIn.includes(list.id)) {
        const detail = await api.wishlist(list.id);
        const item = detail.items.find((i) => i.materialId === materialId);
        if (item) await api.removeWishlistItem(list.id, item.id);
        onChanged(containedIn.filter((id) => id !== list.id));
        setLists((prev) => prev?.map((l) => (l.id === list.id ? { ...l, itemCount: Math.max(0, (l.itemCount ?? 1) - 1) } : l)) ?? prev);
      } else {
        await api.addWishlistItem(list.id, { materialId, quantity, listingId: listingId ?? undefined });
        onChanged([...containedIn, list.id]);
        setLists((prev) => prev?.map((l) => (l.id === list.id ? { ...l, itemCount: (l.itemCount ?? 0) + 1 } : l)) ?? prev);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setBusy("new");
    setError(null);
    try {
      const list = await api.createWishlist(trimmed);
      await api.addWishlistItem(list.id, { materialId, quantity, listingId: listingId ?? undefined });
      setLists((prev) => [...(prev ?? []), { ...list, itemCount: 1 }]);
      onChanged([...containedIn, list.id]);
      setName("");
      setCreating(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("saveToList")}>
      {lists === null && !error ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      {lists?.map((l) => {
        const on = containedIn.includes(l.id);
        return (
          <Pressable key={l.id} onPress={() => void toggle(l)} disabled={busy !== null} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <View style={[styles.icon, on && { backgroundColor: colors.primary }]}>
              {busy === l.id ? <ActivityIndicator size="small" color={on ? "#fff" : colors.primary} /> : <Ionicons name={on ? "heart" : "heart-outline"} size={18} color={on ? "#fff" : colors.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{l.name}</Text>
              <Text style={typography.caption}>
                {l.itemCount ?? 0} {(l.itemCount ?? 0) === 1 ? t("item") : t("items")}
                {l.isDefault ? ` · ${t("defaultLabel")}` : ""}
              </Text>
            </View>
            {on ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
      {creating ? (
        <View style={styles.newBox}>
          <TextField label={t("listName")} value={name} onChangeText={setName} placeholder={t("listNamePlaceholder")} autoFocus maxLength={60} returnKeyType="done" onSubmitEditing={() => void create()} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title={t("cancel")} variant="ghost" onPress={() => setCreating(false)} style={{ flex: 1 }} />
            <Button title={t("createList")} loading={busy === "new"} disabled={name.trim().length < 2} onPress={() => void create()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setCreating(true)} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.neutralLight }]}>
            <Ionicons name="add" size={20} color={colors.text} />
          </View>
          <Text style={[styles.name, { color: colors.primary }]}>{t("newList")}</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  name: { ...typography.body, fontWeight: "600" },
  newBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.neutralLight },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
});
