import React from "react";
import { View, StyleSheet, Animated } from "react-native";
import { useTheme } from "react-native-paper";

type Props = {
  total: number;
  scrollX: Animated.Value;
  width: number;
};

export default function SliderDots({ total, scrollX, width }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => {
        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];

        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [6, 24, 6],
          extrapolate: "clamp",
        });

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.4, 1, 0.4],
          extrapolate: "clamp",
        });

        const backgroundColor = scrollX.interpolate({
          inputRange,
          outputRange: [theme.colors.outline, theme.colors.primary, theme.colors.outline],
          extrapolate: "clamp",
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                width: dotWidth,
                opacity,
                backgroundColor,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    height: 6,
    borderRadius: 6,
  },
});
