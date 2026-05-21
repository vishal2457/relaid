import { useState, useEffect, useCallback } from "react";
import { VersionCheckService, type VersionCheckData } from "./version-check";

interface VersionCheckState {
  isLoading: boolean;
  isForceUpdateRequired: boolean;
  versionData: VersionCheckData | null;
  currentVersion: string | null;
  error: Error | null;
}

const initialState: VersionCheckState = {
  isLoading: true,
  isForceUpdateRequired: false,
  versionData: null,
  currentVersion: null,
  error: null,
};

export function useVersionCheck() {
  const [state, setState] = useState<VersionCheckState>(initialState);

  const check = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await VersionCheckService.checkVersion();
      setState({
        isLoading: false,
        isForceUpdateRequired: result.isForceUpdateRequired,
        versionData: result.versionData,
        currentVersion: result.currentVersion,
        error: null,
      });
    } catch (err) {
      // Fail gracefully — a broken version check should never crash the app
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error("Version check failed"),
      }));
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return { ...state, recheck: check };
}
