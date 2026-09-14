import React from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";
import type { Material } from "@mysupplier/shared";
import { colors, radius } from "@/theme";

interface ProductImageProps {
  material: Pick<Material, "sku" | "name" | "imageUrl" | "category" | "categoryId"> & { categorySlug?: string };
  size?: number;
  /** Fill the parent instead of a fixed square. */
  fill?: boolean;
  style?: ViewStyle;
  rounded?: number;
}

const TILE_TONES = [
  { bg: "#E3F2EC", fg: "#0B6E4F" },
  { bg: "#FFF4D6", fg: "#9A6B00" },
  { bg: "#DBEAFE", fg: "#1D4ED8" },
  { bg: "#FCE7F3", fg: "#BE185D" },
  { bg: "#EDE9FE", fg: "#6D28D9" },
  { bg: "#FEE2E2", fg: "#B91C1C" },
  { bg: "#E0F2FE", fg: "#0369A1" },
  { bg: "#F3F4F6", fg: "#374151" },
];

const KEYWORD_ICONS: Array<[RegExp, string]> = [
  [/cement|concrete|mortar|grout/i, "🧱"],
  [/steel|rebar|iron|mesh|beam/i, "🏗️"],
  [/block|brick/i, "🧱"],
  [/sand|aggregate|gravel|stone/i, "⛰️"],
  [/tile|floor|marble|ceramic|porcelain/i, "◼️"],
  [/paint|coating|primer/i, "🎨"],
  [/wood|timber|plywood|door/i, "🪵"],
  [/pipe|plumb|valve|pvc|tank/i, "🔧"],
  [/electric|cable|wire|switch|lamp/i, "⚡"],
  [/insulat|foam|gypsum|board|ceiling/i, "🧊"],
  [/glass|window|aluminium|aluminum/i, "🪟"],
  [/roof|waterproof|bitumen|membrane/i, "🏠"],
  [/tool|drill|saw|safety|helmet/i, "🛠️"],
];

function pickTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length];
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9؀-ۿ ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function categoryEmoji(material: ProductImageProps["material"]): string {
  if (material.category?.icon) return material.category.icon;
  const haystack = `${material.category?.name ?? ""} ${material.category?.slug ?? ""} ${material.categorySlug ?? ""} ${material.name}`;
  const hit = KEYWORD_ICONS.find(([re]) => re.test(haystack));
  return hit ? hit[1] : "📦";
}

/**
 * Product picture. Uses the material's real `imageUrl` when present; otherwise
 * draws a tinted fallback tile (category emoji + initials) because the API's
 * generated SVG cannot be rendered by React Native's <Image>.
 */
export function ProductImage({ material, size = 120, fill = false, style, rounded = radius.md }: ProductImageProps) {
  const dims: ViewStyle = fill ? { width: "100%", aspectRatio: 1 } : { width: size, height: size };
  if (material.imageUrl) {
    return (
      <View style={[styles.wrap, dims, { borderRadius: rounded }, style]}>
        <Image source={{ uri: material.imageUrl }} style={styles.img} resizeMode="cover" accessibilityLabel={material.name} />
      </View>
    );
  }
  const tone = pickTone(material.sku || material.name);
  const emojiSize = fill ? 40 : Math.max(18, Math.round(size * 0.34));
  const textSize = fill ? 16 : Math.max(10, Math.round(size * 0.15));
  return (
    <View style={[styles.wrap, styles.tile, dims, { borderRadius: rounded, backgroundColor: tone.bg }, style]} accessibilityLabel={material.name}>
      <Text style={{ fontSize: emojiSize, lineHeight: emojiSize + 6 }}>{categoryEmoji(material)}</Text>
      <Text style={[styles.initials, { color: tone.fg, fontSize: textSize }]}>{initials(material.name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: colors.neutralLight },
  img: { width: "100%", height: "100%" },
  tile: { alignItems: "center", justifyContent: "center", gap: 2 },
  initials: { fontWeight: "800", letterSpacing: 1 },
});
