import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react";
import { useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { AppRouter } from "./routes/router";
import { updateApi, type UpdateStatus } from "./shared/api/features/update.api";
import { TooltipProvider } from "./shared/components/ui/tooltip";
import { UpdateDialog } from "./shared/components/update-dialog/update-dialog";
import { ipcRuntime } from "./shared/ipc/ipc-runtime";
import { healthApi } from "./shared/api/features/health.api";
import {
  initializeApiBaseUrl,
} from "./shared/utils/runtime-config";
import { queryClient } from "./shared/utils/query-client";
import { SpinnerLoader } from "./shared/components/loader/spinner.loader";

function App() {
  const [healthState, setHealthState] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  const [healthMessage, setHealthMessage] = useState(
    "Starting desktop services...",
  );
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const maxAttempts = 20;
    const retryDelayMs = 500;

    const check = async () => {
      const resolvedApiBaseUrl = await initializeApiBaseUrl();
      if (cancelled) {
        return;
      }

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await healthApi.checkHealth(resolvedApiBaseUrl);
          const payload = await response.json();
          if (cancelled) {
            return;
          }

          if (response.ok) {
            setHealthState("ready");
            return;
          }

          const issues = payload?.result?.issues?.join(", ");
          setHealthMessage(
            issues
              ? `Embedded server is up, but configuration is incomplete: ${issues}`
              : "Embedded server failed its health check.",
          );
        } catch (error) {
          if (cancelled) {
            return;
          }

          if (attempt === maxAttempts) {
            setHealthMessage(
              error instanceof Error
                ? error.message
                : "Unable to reach the embedded server.",
            );
            setHealthState("failed");
            return;
          }

          setHealthMessage(
            "Connecting to local API...",
          );
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }

      if (!cancelled) {
        setHealthMessage(
          `Unable to reach the embedded server at ${resolvedApiBaseUrl}.`,
        );
        setHealthState("failed");
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (healthState !== "ready") {
      return;
    }

    let cancelled = false;

    const checkForUpdates = async () => {
      try {
        const result = await updateApi.checkForUpdates();
        if (cancelled || !result.isUpdateAvailable || !result.downloadUrl) {
          return;
        }

        setUpdateStatus(result);
        setIsUpdateDialogOpen(true);
      } catch (error) {
        console.error("Failed to check for updates:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to check for desktop updates.",
        );
      }
    };

    void checkForUpdates();

    return () => {
      cancelled = true;
    };
  }, [healthState]);

  useEffect(() => {
    const eventsOn = ipcRuntime.getEventsOn();
    if (!eventsOn) {
      return;
    }

    const disposeStart = eventsOn("update_loading_start", () => {
      setIsUpdating(true);
    });
    const disposeEnd = eventsOn("update_loading_end", () => {
      setIsUpdating(false);
    });

    return () => {
      disposeStart?.();
      disposeEnd?.();
    };
  }, []);

  useEffect(() => {
    if (updateTimeoutRef.current !== null) {
      window.clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    if (!isUpdating) {
      return;
    }

    updateTimeoutRef.current = window.setTimeout(() => {
      setIsUpdating(false);
      toast.error(
        "The update is taking longer than expected. Check the relay URL and try again.",
      );
    }, 90_000);

    return () => {
      if (updateTimeoutRef.current !== null) {
        window.clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, [isUpdating]);

  const handleUpdate = async () => {
    if (!updateStatus || isUpdating) {
      return;
    }

    setIsUpdating(true);
    try {
      await updateApi.downloadAndInstallUpdate(
        updateStatus.downloadUrl,
        updateStatus.fileName,
      );
    } catch (error) {
      console.error("Failed to install update:", error);
      setIsUpdating(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to download or install the desktop update.",
      );
    }
  };

  if (healthState !== "ready") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <SpinnerLoader className="h-8 w-8" />
        <p className="text-sm text-muted-foreground">{healthMessage}</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          <AppRouter />
          {updateStatus ? (
            <UpdateDialog
              open={isUpdateDialogOpen}
              setOpen={setIsUpdateDialogOpen}
              handleUpdate={handleUpdate}
              isUpdating={isUpdating}
              currentVersion={updateStatus.currentVersion}
              latestVersion={updateStatus.latestVersion}
            />
          ) : null}
        </QueryClientProvider>
        <Toaster
          visibleToasts={5}
          position="bottom-right"
          richColors
          theme="dark"
          closeButton
        />
      </NuqsAdapter>
    </TooltipProvider>
  );
}

export default App;
