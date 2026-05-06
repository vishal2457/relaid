import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { clearActiveSessionStream } from "@/src/lib/active-session-stream";
import { disconnectSseClient } from "@/src/lib/sse";
import { queryClient } from "@/src/lib/query-client";
import { registerSessionInvalidationHandler } from "@/src/lib/pairing/auth";
import {
  clearPairingSession as clearStoredPairingSession,
  loadStoredPairingSession,
  savePairingSession as saveStoredPairingSession,
  type PairingSession,
} from "@/src/lib/pairing/session";

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
    disconnectSseClient();
    await queryClient.invalidateQueries();
    setSession(nextSession);
  }, []);

  const clearSession = useCallback(async () => {
    disconnectSseClient();
    await clearStoredPairingSession();
    await clearActiveSessionStream();
    queryClient.clear();
    setSession(null);
  }, []);

  useEffect(() => {
    return registerSessionInvalidationHandler(async () => {
      await clearSession();
    });
  }, [clearSession]);

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
