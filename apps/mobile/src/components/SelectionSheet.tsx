import BottomSheet, { BottomSheetFlatList, BottomSheetView } from "@gorhom/bottom-sheet";
import React from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type KeyboardEvent,
} from "react-native";
import {
  ActivityIndicator,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SelectionSheetProps<T> = {
  visible: boolean;
  title: string;
  data?: T[];
  onClose: () => void;
  onItemPress?: (item: T, index: number) => void;
  searchPlaceholder?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  emptyText?: string;
  selectedId?: string | null;
  getItemId?: (item: T, index: number) => string | null | undefined;
  renderItem?: (item: T, isSelected: boolean, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  children?: React.ReactNode;
  snapPoints?: string[];
  enableDynamicSizing?: boolean;
};

export function SelectionSheet<T>({
  visible,
  title,
  data,
  onClose,
  onItemPress,
  searchPlaceholder = "Search",
  searchQuery = "",
  onSearchChange,
  isLoading = false,
  emptyText = "No items found",
  selectedId,
  getItemId,
  renderItem,
  keyExtractor,
  children,
  snapPoints: customSnapPoints,
  enableDynamicSizing = false,
}: SelectionSheetProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.dark;
  const sheetBg = isDark ? "#1E293B" : "#FFFFFF";
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  
  const snapPoints = React.useMemo(
    () => customSnapPoints || (enableDynamicSizing ? [] : ["50%", "80%"]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customSnapPoints ? customSnapPoints.join(",") : "default"],
  );

  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const wasVisible = React.useRef(visible);
  const initialIndex = React.useRef(0);

  if (visible && !wasVisible.current) {
    const isKeyboardVisible =
      // @ts-ignore
      Keyboard.isVisible?.() || (Keyboard.metrics()?.height ?? 0) > 0;
    
    // If dynamic sizing is enabled and no snap points are provided, max index is 0.
    const maxIndex = snapPoints.length > 0 ? snapPoints.length - 1 : 0;
    initialIndex.current = isKeyboardVisible ? Math.min(1, maxIndex) : 0;
  }
  wasVisible.current = visible;

  React.useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(
      showEvent,
      (event: KeyboardEvent) => {
        setKeyboardHeight(event.endCoordinates.height);
      },
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const listBottomPadding = Math.max(insets.bottom, 24) + keyboardHeight;

  const resolveItemId = React.useCallback(
    (item: T, index: number) => getItemId?.(item, index),
    [getItemId],
  );

  const resolveKey = React.useCallback(
    (item: T, index: number) =>
      keyExtractor?.(item, index) ??
      resolveItemId(item, index) ??
      String(index),
    [keyExtractor, resolveItemId],
  );

  const handleOverlayPress = () => {
    if (onSearchChange) onSearchChange("");
    bottomSheetRef.current?.close();
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress} />

      <BottomSheet
        ref={bottomSheetRef}
        index={initialIndex.current}
        snapPoints={snapPoints.length > 0 ? snapPoints : undefined}
        enableDynamicSizing={enableDynamicSizing}
        enablePanDownToClose
        onClose={onClose}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backgroundStyle={{ backgroundColor: sheetBg }}
        handleIndicatorStyle={{ backgroundColor: "#CBD5E1" }}
      >
        {children ? (
          <BottomSheetView>
            <View>
              <Text
                variant="titleMedium"
                style={[styles.title, { color: theme.colors.onSurface }]}
              >
                {title}
              </Text>

              {onSearchChange && (
                <View style={styles.searchContainer}>
                  <TextInput
                    mode="outlined"
                    dense
                    value={searchQuery}
                    onChangeText={onSearchChange}
                    placeholder={searchPlaceholder}
                    // @ts-expect-error: autoCapitalize is passed to underlying TextInput but missing from paper types
                    autoCapitalize="none"
                    autoCorrect={false}
                    left={<TextInput.Icon icon="magnify" />}
                    right={
                      searchQuery ? (
                        <TextInput.Icon
                          icon="close"
                          onPress={() => onSearchChange("")}
                        />
                      ) : undefined
                    }
                  />
                </View>
              )}
            </View>
            <View
              style={[
                styles.childrenContainer,
                { paddingBottom: listBottomPadding },
              ]}
            >
              {children}
            </View>
          </BottomSheetView>
        ) : (
          <>
            <View>
              <Text
                variant="titleMedium"
                style={[styles.title, { color: theme.colors.onSurface }]}
              >
                {title}
              </Text>

              {onSearchChange && (
                <View style={styles.searchContainer}>
                  <TextInput
                    mode="outlined"
                    dense
                    value={searchQuery}
                    onChangeText={onSearchChange}
                    placeholder={searchPlaceholder}
                    // @ts-expect-error: autoCapitalize is passed to underlying TextInput but missing from paper types
                    autoCapitalize="none"
                    autoCorrect={false}
                    left={<TextInput.Icon icon="magnify" />}
                    right={
                      searchQuery ? (
                        <TextInput.Icon
                          icon="close"
                          onPress={() => onSearchChange("")}
                        />
                      ) : undefined
                    }
                  />
                </View>
              )}
            </View>
            {isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator />
              </View>
            ) : data && renderItem ? (
              <BottomSheetFlatList
                data={data}
                keyExtractor={resolveKey}
                style={styles.list}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: listBottomPadding },
                ]}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => {
                  const itemId = resolveItemId(item, index);
                  const isSelected =
                    selectedId !== undefined &&
                    selectedId !== null &&
                    itemId !== undefined &&
                    itemId !== null &&
                    itemId === selectedId;

                  const content = renderItem(item, isSelected, index);
                  if (!content) return null;

                  if (!onItemPress) return <View>{content}</View>;

                  return (
                    <Pressable onPress={() => onItemPress(item, index)}>
                      <View>{content}</View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {emptyText}
                    </Text>
                  </View>
                }
              />
            ) : null}
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  title: {
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  loading: {
    padding: 32,
    alignItems: "center",
  },
  empty: {
    padding: 32,
    alignItems: "center",
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 40,
  },
  childrenContainer: {
    paddingHorizontal: 20,
  },
});
