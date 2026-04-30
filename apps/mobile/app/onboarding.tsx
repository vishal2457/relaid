import SliderDots from "@/src/components/SliderDots";
import React, { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "react-native-paper";
import { router } from "expo-router";

const { width, height } = Dimensions.get("window");

const DATA = [
  {
    key: "1",
    title: "Connect Your Workspace",
    subtitle:
      "Scan the QR code from your local CLI to securely link your mobile device with your development environment.",
    image: require("../src/assets/images/screen1.png"),
  },
  {
    key: "2",
    title: "Sync Your Projects",
    subtitle:
      "Browse and manage projects seamlessly. Changes reflect instantly across all your connected devices.",
    image: require("../src/assets/images/screen2.png"),
  },
  {
    key: "3",
    title: "Code with AI Anywhere",
    subtitle:
      "Use built-in AI tools to edit code, fix bugs, and build features directly from your phone.",
    image: require("../src/assets/images/screen3.png"),
  },
];

export default function Onboarding() {
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const isLastSlide = index === DATA.length - 1;

  const handleNext = () => {
    const next = Math.min(index + 1, DATA.length - 1);
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  };

  // Animated button behavior
  const buttonWidth = scrollX.interpolate({
    inputRange: DATA.map((_, i) => i * width),
    outputRange: DATA.map((_, i) => (i === DATA.length - 1 ? width - 40 : 140)),
    extrapolate: "clamp",
  });

  const buttonRadius = scrollX.interpolate({
    inputRange: DATA.map((_, i) => i * width),
    outputRange: DATA.map((_, i) => (i === DATA.length - 1 ? 16 : 30)),
    extrapolate: "clamp",
  });

  const nextOpacity = scrollX.interpolate({
    inputRange: [(DATA.length - 2) * width, (DATA.length - 1) * width],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const startOpacity = scrollX.interpolate({
    inputRange: [(DATA.length - 2) * width, (DATA.length - 1) * width],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const renderItem = ({ item }: any) => (
    <View style={styles.page}>
      <View
        style={[styles.imageCard, { backgroundColor: theme.colors.surface }]}
      >
        <Image source={item.image} style={styles.image} />
      </View>

      <Text style={[styles.title, { color: theme.colors.onSurface }]}>
        {item.title}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        {item.subtitle}
      </Text>
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar barStyle={theme.dark ? "light-content" : "dark-content"} />

      <Animated.FlatList
        ref={listRef}
        data={DATA}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
      />

      <View
        style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 16 }]}
      >
        <SliderDots total={DATA.length} scrollX={scrollX} width={width} />

        <Animated.View
          style={[
            styles.button,
            {
              width: buttonWidth,
              borderRadius: buttonRadius,
              backgroundColor: theme.colors.primary,
              shadowColor: theme.colors.primary,
            },
          ]}
        >
          <Pressable
            style={styles.pressable}
            onPress={() => {
              if (isLastSlide) {
                router.push("/pair" as any);
                return;
              }
              handleNext();
            }}
          >
            <Animated.Text
              style={[
                styles.btnText,
                { opacity: nextOpacity, color: theme.colors.onPrimary },
              ]}
            >
              Next
            </Animated.Text>

            <Animated.Text
              style={[
                styles.btnText,
                styles.absoluteText,
                { opacity: startOpacity, color: theme.colors.onPrimary },
              ]}
            >
              Get Started
            </Animated.Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  page: {
    width,
    height,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 160,
  },

  imageCard: {
    width: width - 48,
    height: height * 0.5,
    borderRadius: 24,
    overflow: "hidden",

    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,

    marginBottom: 30,
  },

  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
  },

  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
    maxWidth: 300,
  },

  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    gap: 16,
  },

  button: {
    height: 54,
    alignSelf: "center",
    justifyContent: "center",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  pressable: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  btnText: {
    fontSize: 16,
    fontWeight: "600",
  },

  absoluteText: {
    position: "absolute",
  },
});
