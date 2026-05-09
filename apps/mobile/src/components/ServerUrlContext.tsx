import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import * as SecureStore from "expo-secure-store";
import { updateBaseUrl } from "@/src/lib/axios/base";

const DEFAULT_SERVER_URL = "https://relaid.derived.dev";
const SERVER_URL_KEY = "SERVER_BASE_URL";

interface ServerUrlContextType {
  serverUrl: string;
  setServerUrl: (url: string) => Promise<void>;
  hydrated: boolean;
}

const ServerUrlContext = createContext<ServerUrlContextType | undefined>(
  undefined,
);

export const useServerUrl = () => {
  const context = useContext(ServerUrlContext);
  if (context === undefined) {
    throw new Error("useServerUrl must be used within a ServerUrlProvider");
  }
  return context;
};

interface ServerUrlProviderProps {
  children: React.ReactNode;
}

export const ServerUrlProvider: React.FC<ServerUrlProviderProps> = ({
  children,
}) => {
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(SERVER_URL_KEY);
        if (saved) {
          setServerUrlState(saved);
          updateBaseUrl(saved);
        }
      } catch {
        // noop
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setServerUrl = useCallback(async (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    setServerUrlState(trimmed);
    updateBaseUrl(trimmed);
    try {
      await SecureStore.setItemAsync(SERVER_URL_KEY, trimmed);
    } catch {
      // noop
    }
  }, []);

  return (
    <ServerUrlContext.Provider value={{ serverUrl, setServerUrl, hydrated }}>
      {children}
    </ServerUrlContext.Provider>
  );
};

export { DEFAULT_SERVER_URL };
