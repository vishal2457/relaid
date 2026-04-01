import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeKey } from "@/constants/themes";

const THEME_PREFERENCE_KEY = "APP_THEME_KEY_PREFERENCE";

interface ThemeContextType {
  selectedTheme: ThemeKey;
  setSelectedTheme: (theme: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useAppTheme must be used within a ThemeProvider");
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const AppThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
}) => {
  const [selectedTheme, setSelectedThemeState] = useState<ThemeKey>("default");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
        if (saved) {
          setSelectedThemeState(saved as ThemeKey);
        }
      } catch {
        // noop
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, selectedTheme).catch(() => {});
  }, [selectedTheme, hydrated]);

  const setSelectedTheme = (theme: ThemeKey) => {
    setSelectedThemeState(theme);
  };

  return (
    <ThemeContext.Provider value={{ selectedTheme, setSelectedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
