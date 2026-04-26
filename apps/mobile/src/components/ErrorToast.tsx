import React, { useEffect, useRef } from "react";
import { StyleSheet, View, Animated, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type ErrorToastProps = {
  visible: boolean;
  message: string;
  onDismiss: () => void;
  bottomOffset?: number;
};

export function ErrorToast({
  visible,
  message,
  onDismiss,
  bottomOffset = 0,
}: ErrorToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        onDismiss();
      }, 5000); // Auto dismiss after 5 seconds

      return () => clearTimeout(timer);
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 10,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMounted(false);
      });
    }
  }, [visible, onDismiss, opacity, translateY]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          bottom: bottomOffset + 12,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.content}>
        <Text style={styles.messageText}>{message}</Text>
        <Pressable onPress={onDismiss} style={styles.closeButton} hitSlop={10}>
          <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 50,
  },
  content: {
    backgroundColor: "#333333", // Dark grayish black
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 15,
    flex: 1,
    marginRight: 12,
    lineHeight: 22,
  },
  closeButton: {
    padding: 4,
  },
});
