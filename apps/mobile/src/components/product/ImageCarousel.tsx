import React, { useState } from "react";
import { Image, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import type { Material } from "@mysupplier/shared";
import { colors, radius, spacing } from "@/theme";
import { ProductImage } from "../ProductImage";

interface Props {
  material: Pick<Material, "sku" | "name" | "imageUrl" | "category" | "categoryId">;
  images?: string[] | null;
  /** Rendered over the picture (badges). */
  overlay?: React.ReactNode;
}

/** Paged gallery of `imageUrl` + `images[]` with dots; falls back to the tinted tile. */
export function ImageCarousel({ material, images, overlay }: Props) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const urls = Array.from(new Set([material.imageUrl, ...(images ?? [])].filter((u): u is string => Boolean(u))));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (next !== index) setIndex(next);
  };

  return (
    <View style={styles.wrap}>
      {urls.length === 0 ? (
        <View style={styles.tileWrap}>
          <ProductImage material={material} size={180} rounded={radius.xl} />
        </View>
      ) : (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} scrollEventThrottle={16}>
          {urls.map((uri) => (
            <Image key={uri} source={{ uri }} style={{ width, aspectRatio: 1 }} resizeMode="cover" accessibilityLabel={material.name} />
          ))}
        </ScrollView>
      )}
      {urls.length > 1 ? (
        <View style={styles.dots}>
          {urls.map((u, i) => (
            <View key={u} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
      {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface },
  tileWrap: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl },
  dots: { position: "absolute", bottom: spacing.md, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(17,24,39,0.25)" },
  dotActive: { backgroundColor: colors.primary, width: 18 },
  overlay: { position: "absolute", top: spacing.md, left: spacing.lg, flexDirection: "row", gap: 6 },
});
