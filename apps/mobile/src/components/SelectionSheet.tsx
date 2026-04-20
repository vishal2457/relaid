import React from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";

type SelectionSheetProps<T> = {
  visible: boolean;
  title: string;
  data: T[];
  onClose: () => void;
  onItemPress?: (item: T, index: number) => void;
  searchPlaceholder?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  emptyText?: string;
  selectedId?: string | null;
  getItemId?: (item: T, index: number) => string | null | undefined;
  renderItem: (item: T, isSelected: boolean, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
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
}: SelectionSheetProps<T>) {
  const theme = useTheme();
  const isDark = theme.dark;

  const sheetBg = isDark ? "#1E293B" : "#FFFFFF";

  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = React.useMemo(() => ["50%", "80%"], []);

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
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
        backgroundStyle={{ backgroundColor: sheetBg }}
        handleIndicatorStyle={{ backgroundColor: "#CBD5E1" }}
      >
        <BottomSheetView style={{ flex: 1 }}>
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

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={data}
              keyExtractor={resolveKey}
              contentContainerStyle={{ paddingBottom: 40 }}
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
          )}
        </BottomSheetView>
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
});
