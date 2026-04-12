import { useState, useEffect, useCallback } from "react";

const getApp = () => {
  const app = (window as any).go?.main?.App;
  if (!app) {
    throw new Error("Wails App not initialized");
  }
  return app;
};

export const useRelayHooks = () => {
  const [storedUrl, setStoredUrl] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  const checkConnection = useCallback(async () => {
    try {
      const App = getApp();
      const connected = await App.PingRelay();
      setIsConnected(connected);
      return connected;
    } catch {
      setIsConnected(false);
      return false;
    }
  }, []);

  const fetchStoredUrl = async () => {
    try {
      const App = getApp();
      const url = await App.GetStoredRelayURL();
      setStoredUrl(url || "");

      if (url) {
        await checkConnection();
      } else {
        setIsConnected(false);
      }
    } catch {
      setStoredUrl("");
      setIsConnected(false);
    }
  };

  useEffect(() => {
    fetchStoredUrl();
  }, []);

  const saveUrl = async (url: string) => {
    setIsSaving(true);
    try {
      const App = getApp();
      await App.StoreRelayURL(url);
      setStoredUrl(url);
      await checkConnection();
    } catch (err) {
      console.error("Failed to save URL:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const pingRelay = useCallback(async () => {
    setIsPinging(true);
    try {
      const connected = await checkConnection();
      return connected;
    } finally {
      setIsPinging(false);
    }
  }, [checkConnection]);

  const createPairing = async () => {
    setIsCreating(true);
    try {
      const App = getApp();
      return await App.CreatePairingSession();
    } catch (err) {
      console.error("Failed to create pairing session:", err);
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    storedUrl,
    isConnected,
    isSaving,
    isCreating,
    isPinging,
    saveUrl,
    pingRelay,
    createPairing,
  };
};
