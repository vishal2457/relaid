import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

export type ThemeKey =
  | "default"
  | "grey"
  | "blue"
  | "green"
  | "midnight"
  | "forest"
  | "rose"
  | "monochrome"
  | "sunset"
  | "lavender"
  | "corporate";

const enhanceThemeColors = (baseColors: any, customColors: any) => {
  return {
    ...baseColors,
    ...customColors,
    primaryContainer: customColors.primaryContainer || customColors.primary,
    secondaryContainer:
      customColors.secondaryContainer || customColors.secondary,
    onSurfaceVariant: customColors.onSurfaceVariant || customColors.onSurface,
    errorContainer: customColors.errorContainer || customColors.error,
    onPrimaryContainer:
      customColors.onPrimaryContainer || customColors.onPrimary,
    onSecondaryContainer:
      customColors.onSecondaryContainer || customColors.onSecondary,
    onErrorContainer: customColors.onErrorContainer || customColors.onError,
    surfaceVariant: customColors.surfaceVariant || customColors.surface,
    inverseSurface: customColors.inverseSurface || customColors.onSurface,
    inverseOnSurface: customColors.inverseOnSurface || customColors.surface,
    inversePrimary: customColors.inversePrimary || customColors.primary,
    elevation: customColors.elevation || baseColors.elevation,
  };
};

export const greyTheme = {
  ...MD3DarkTheme,
  colors: enhanceThemeColors(MD3DarkTheme.colors, {
    primary: "#64748B",
    secondary: "#A5B4FC",
    background: "#22272E",
    surface: "#323843",
    onSurface: "#F1F5F9",
    error: "#F87171",
    outline: "#475569",
    onPrimary: "#FFFFFF",
    onSecondary: "#232136",
    onError: "#FFFFFF",
    card: "#323843",
  }),
};

export const blueTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#0EA5E9",
    secondary: "#1D4ED8",
    background: "#E0F2FE",
    surface: "#F1F5F9",
    onSurface: "#1E293B",
    error: "#F43F5E",
    outline: "#7DD3FC",
    onPrimary: "#FFFFFF",
    onSecondary: "#F1F5F9",
    onError: "#FFFFFF",
    card: "#F1F5F9",
  }),
};

export const greenTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#22C55E",
    secondary: "#84CC16",
    background: "#F0FDF4",
    surface: "#FFFFFF",
    onSurface: "#14532D",
    error: "#F87171",
    outline: "#BBF7D0",
    onPrimary: "#FFFFFF",
    onSecondary: "#232136",
    onError: "#FFFFFF",
    card: "#FFFFFF",
  }),
};

export const midnightTheme = {
  ...MD3DarkTheme,
  colors: enhanceThemeColors(MD3DarkTheme.colors, {
    primary: "#FFD700",
    secondary: "#E6AC00",
    background: "#0A0A0B",
    surface: "#1A1A1C",
    onSurface: "#F8F9FA",
    error: "#FF6B6B",
    outline: "#404041",
    onPrimary: "#000000",
    onSecondary: "#000000",
    onError: "#FFFFFF",
    card: "#1A1A1C",
  }),
};

export const defaultTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#0077BE",
    secondary: "#005C91",
    background: "#F0F8FF",
    surface: "#FFFFFF",
    onSurface: "#1E3A5F",
    error: "#DC3545",
    outline: "#B3D9FF",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onError: "#FFFFFF",
    card: "#FFFFFF",
  }),
};

export const forestTheme = {
  ...MD3DarkTheme,
  colors: enhanceThemeColors(MD3DarkTheme.colors, {
    primary: "#4ADE80",
    secondary: "#059669",
    background: "#0F1B0F",
    surface: "#1A2E1A",
    onSurface: "#E8F5E8",
    error: "#F87171",
    outline: "#2D5A2D",
    onPrimary: "#000000",
    onSecondary: "#FFFFFF",
    onError: "#FFFFFF",
    card: "#1A2E1A",
  }),
};

export const roseTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#E91E63",
    secondary: "#AD1457",
    background: "#FDF2F8",
    surface: "#FFFFFF",
    onSurface: "#4A1A2A",
    error: "#DC2626",
    outline: "#F9A8D4",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onError: "#FFFFFF",
    card: "#FFFFFF",
  }),
};

export const monochromeTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#000000",
    secondary: "#404040",
    background: "#FFFFFF",
    surface: "#F8F9FA",
    onSurface: "#000000",
    error: "#DC3545",
    outline: "#DEE2E6",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onError: "#FFFFFF",
    card: "#F8F9FA",
  }),
};

export const sunsetTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#FF6B35",
    secondary: "#F7931E",
    background: "#FFF8F0",
    surface: "#FFFFFF",
    onSurface: "#2D1810",
    error: "#DC2626",
    outline: "#FFD4B3",
    onPrimary: "#FFFFFF",
    onSecondary: "#000000",
    onError: "#FFFFFF",
    card: "#FFFFFF",
  }),
};

export const lavenderTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#8B5CF6",
    secondary: "#7C3AED",
    background: "#FAFAFA",
    surface: "#FFFFFF",
    onSurface: "#2D1B69",
    error: "#EF4444",
    outline: "#C4B5FD",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onError: "#FFFFFF",
    card: "#FFFFFF",
  }),
};

export const corporateTheme = {
  ...MD3LightTheme,
  colors: enhanceThemeColors(MD3LightTheme.colors, {
    primary: "#1B365D",
    secondary: "#B8860B",
    background: "#F5F5F5",
    surface: "#FFFFFF",
    onSurface: "#1B365D",
    error: "#D32F2F",
    outline: "#90A4AE",
    onPrimary: "#FFFFFF",
    onSecondary: "#FFFFFF",
    onError: "#FFFFFF",
    card: "#FFFFFF",
  }),
};

export const THEMES: { key: ThemeKey; theme: object }[] = [
  { key: "default", theme: defaultTheme },
  { key: "grey", theme: greyTheme },
  { key: "blue", theme: blueTheme },
  { key: "green", theme: greenTheme },
  { key: "midnight", theme: midnightTheme },
  { key: "forest", theme: forestTheme },
  { key: "rose", theme: roseTheme },
  { key: "monochrome", theme: monochromeTheme },
  { key: "sunset", theme: sunsetTheme },
  { key: "lavender", theme: lavenderTheme },
  { key: "corporate", theme: corporateTheme },
];

export type AppTheme = typeof defaultTheme;
