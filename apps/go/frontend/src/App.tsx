import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AppRouter } from "./routes/router";
import { TooltipProvider } from "./shared/components/ui/tooltip";
import { healthApi } from "./shared/api/features/health.api";
import {
  getApiBaseUrl,
  initializeApiBaseUrl,
} from "./shared/utils/runtime-config";
import { queryClient } from "./shared/utils/query-client";

function App() {
  const [healthState, setHealthState] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl());
  const [healthMessage, setHealthMessage] = useState(
    "Starting desktop services...",
  );

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
      setApiBaseUrl(resolvedApiBaseUrl);

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
            `Waiting for local API (${attempt}/${maxAttempts}) at ${resolvedApiBaseUrl}...`,
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

  if (healthState !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-8 shadow-xl">
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Desktop Bootstrap
          </p>
          <h1 className="mt-4 text-4xl font-semibold">
            {healthState === "loading"
              ? "Waiting for local API"
              : "Desktop API unavailable"}
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            {healthMessage}
          </p>
          <p className="mt-8 text-sm text-muted-foreground">
            Expected API base: {apiBaseUrl}
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          <AppRouter />
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
