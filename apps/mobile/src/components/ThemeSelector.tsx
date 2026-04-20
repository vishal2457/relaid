import React from "react";
import { StyleSheet, TouchableOpacity, View, ScrollView } from "react-native";
import { Card, Text as PaperText, useTheme } from "react-native-paper";
import { ThemeKey, THEMES } from "@/constants/themes";

type ThemeSelectorProps = {
  selectedTheme: ThemeKey;
  onSelectTheme: (theme: ThemeKey) => void;
  size?: number;
};

const THEME_SWATCHES: Record<ThemeKey, [string, string, string, string]> = {
  default: ["#0077BE", "#005C91", "#F0F8FF", "#1E3A5F"],
  grey: ["#B0BEC5", "#90A4AE", "#ECEFF1", "#37474F"],
  blue: ["#1976D2", "#90CAF9", "#E3F2FD", "#0D47A1"],
  green: ["#8BC34A", "#D4E157", "#F1F8E9", "#33691E"],
  midnight: ["#FFD700", "#E6AC00", "#1A1A1C", "#0A0A0B"],
  forest: ["#4ADE80", "#059669", "#1A2E1A", "#0F1B0F"],
  rose: ["#E91E63", "#AD1457", "#FDF2F8", "#4A1A2A"],
  monochrome: ["#000000", "#404040", "#F8F9FA", "#FFFFFF"],
  sunset: ["#FF6B35", "#F7931E", "#FFF8F0", "#2D1810"],
  lavender: ["#8B5CF6", "#7C3AED", "#FAFAFA", "#2D1B69"],
  corporate: ["#1B365D", "#B8860B", "#F5F5F5", "#FFFFFF"],
};

const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedTheme,
  onSelectTheme,
  size = 48,
}) => {
  const paperTheme = useTheme();

  return (
    <Card mode="outlined">
      <Card.Content>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <PaperText variant="bodyLarge" style={styles.settingTitle}>
              Themes
            </PaperText>
            <PaperText variant="bodySmall" style={styles.settingDescription}>
              Switch themes based on your preference
            </PaperText>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContainer}
          style={styles.scrollView}
        >
          {THEMES.map((theme) => (
            <TouchableOpacity
              key={theme.key}
              style={[
                styles.circleWrapper,
                selectedTheme === theme.key && {
                  borderColor: paperTheme.colors.onSurface,
                },
                { width: size + 8, height: size + 8 },
              ]}
              onPress={() => onSelectTheme(theme.key)}
              accessibilityLabel={`Select ${theme.key} theme`}
            >
              <View
                style={[
                  styles.themeCircle,
                  { width: size, height: size, borderRadius: size / 2 },
                ]}
              >
                <View style={styles.halfRow}>
                  <View
                    style={[
                      {
                        backgroundColor: THEME_SWATCHES[theme.key][0],
                        width: size / 2,
                        height: size / 2,
                      },
                    ]}
                  />
                  <View
                    style={[
                      {
                        backgroundColor: THEME_SWATCHES[theme.key][1],
                        width: size / 2,
                        height: size / 2,
                      },
                    ]}
                  />
                </View>
                <View style={styles.halfRow}>
                  <View
                    style={[
                      {
                        backgroundColor: THEME_SWATCHES[theme.key][2],
                        width: size / 2,
                        height: size / 2,
                      },
                    ]}
                  />
                  <View
                    style={[
                      {
                        backgroundColor: THEME_SWATCHES[theme.key][3],
                        width: size / 2,
                        height: size / 2,
                      },
                    ]}
                  />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Card.Content>
    </Card>
  );
};

export default ThemeSelector;

const styles = StyleSheet.create({
  scrollView: {
    marginTop: 20,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  circleWrapper: {
    marginHorizontal: 6,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  themeCircle: {
    overflow: "hidden",
    backgroundColor: "#111",
  },
  halfRow: {
    flexDirection: "row",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontWeight: "500",
    marginBottom: 2,
  },
  settingDescription: {
    opacity: 0.6,
  },
});
