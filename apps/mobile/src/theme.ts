export const colors = {
  primary: "#0B6E4F",
  primaryDark: "#085A40",
  primaryLight: "#E3F2EC",
  accent: "#F2A900",
  accentLight: "#FFF4D6",
  background: "#F6F7F9",
  surface: "#FFFFFF",
  text: "#111827",
  textSecondary: "#4B5563",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
  success: "#16A34A",
  successLight: "#DCFCE7",
  danger: "#DC2626",
  dangerLight: "#FEE2E2",
  warning: "#D97706",
  warningLight: "#FEF3C7",
  info: "#2563EB",
  infoLight: "#DBEAFE",
  neutralLight: "#F3F4F6",
  purple: "#7C3AED",
  purpleLight: "#EDE9FE",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 26, fontWeight: "700" as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: "700" as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodySmall: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 12, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: "600" as const, color: colors.textSecondary },
} as const;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

export const theme = { colors, spacing, radius, typography, shadow };
export type Theme = typeof theme;
