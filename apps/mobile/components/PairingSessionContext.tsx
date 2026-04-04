import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { disconnectChatSocket } from "@/lib/socket/chat";
import { queryClient } from "@/lib/query-client";
import {
  clearPairingSession as clearStoredPairingSession,
  loadStoredPairingSession,
  savePairingSession as saveStoredPairingSession,
  type PairingSession,
} from "@/lib/pairing/session";

type PairingSessionContextValue = {
  hydrated: boolean;
  session: PairingSession | null;
  isPaired: boolean;
  saveSession: (session: PairingSession) => Promise<void>;
  clearSession: () => Promise<void>;
};

const PairingSessionContext = createContext<
  PairingSessionContextValue | undefined
>(undefined);

export function PairingSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<PairingSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const storedSession = await loadStoredPairingSession();
      setSession(storedSession);
      setHydrated(true);
    })();
  }, []);

  const saveSession = useCallback(async (nextSession: PairingSession) => {
    await saveStoredPairingSession(nextSession);
    disconnectChatSocket();
    await queryClient.invalidateQueries();
    setSession(nextSession);
  }, []);

  const clearSession = useCallback(async () => {
    disconnectChatSocket();
    await clearStoredPairingSession();
    queryClient.clear();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      hydrated,
      session,
      isPaired: Boolean(session?.accessToken),
      saveSession,
      clearSession,
    }),
    [hydrated, session, saveSession, clearSession],
  );

  return (
    <PairingSessionContext.Provider value={value}>
      {children}
    </PairingSessionContext.Provider>
  );
}

export function usePairingSession() {
  const context = useContext(PairingSessionContext);
  if (!context) {
    throw new Error(
      "usePairingSession must be used within a PairingSessionProvider",
    );
  }

  return context;
}
