import React from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";

interface Props {
  xml: string;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Renders an inline SVG string. Native uses react-native-svg's SvgXml; the
 * web build of react-native-svg does not ship SvgXml, so there the markup is
 * injected into a DOM node (react-dom is the renderer on web).
 */
export function SvgImage({ xml, width, height, style, accessibilityLabel }: Props) {
  if (Platform.OS === "web" || typeof SvgXml !== "function") {
    const sized = xml.replace(/<svg\b/i, '<svg style="width:100%;height:100%;display:block"');
    // A raw DOM element: only valid on web, where React renders to the DOM.
    const inner = React.createElement("div" as unknown as React.ComponentType<Record<string, unknown>>, {
      role: "img",
      "aria-label": accessibilityLabel,
      style: { width, height },
      dangerouslySetInnerHTML: { __html: sized },
    });
    return <View style={[{ width, height }, style]}>{inner}</View>;
  }
  return <SvgXml xml={xml} width={width} height={height} style={style} accessibilityLabel={accessibilityLabel} />;
}

