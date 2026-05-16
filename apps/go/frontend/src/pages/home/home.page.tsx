import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Link2,
  RefreshCw,
  Settings,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "../../shared/components/ui/button";
import { Input } from "../../shared/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../shared/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../shared/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/components/ui/tooltip";
import {
  useRelayHooks,
  useConnectedClients,
  useDesktopStatus,
  useNodeBridgeActions,
} from "../../shared/api/features/relay.api";

type Workspace = {
  id: string;
  name: string;
  description?: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
};

const getApp = () => {
  const app = (window as any).go?.main?.App;
  if (!app) {
    throw new Error("Wails App not initialized");
  }
  return app;
};

export const HomePage = () => {
  const queryClient = useQueryClient();
  const [relayUrl, setRelayUrl] = useState("");
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [pairingData, setPairingData] = useState<{
    pairingUrl: string;
    expiresAt: string;
    initialClientCount: number;
  } | null>(null);

  const {
    storedUrl,
    isConnected,
    saveUrl,
    pingRelay,
    createPairing,
    isSaving,
    isCreating,
    isPinging,
  } = useRelayHooks();

  const { clients, refresh: refreshClients } = useConnectedClients();
  const {
    status: desktopStatus,
    refresh: refreshDesktopStatus,
    isLoading: isDesktopStatusLoading,
    error: desktopStatusError,
  } = useDesktopStatus();
  const {
    downloadNode,
    isDownloading,
  } = useNodeBridgeActions();

  const nodeStatus = desktopStatus?.node;
  const bridgeStatus = desktopStatus?.bridge;
  const visibleNodeError =
    nodeStatus?.error && nodeStatus.error !== "signal: killed"
      ? nodeStatus.error
      : null;
  const visibleBridgeError =
    bridgeStatus?.error && bridgeStatus.error !== "signal: killed"
      ? bridgeStatus.error
      : null;
  const visibleDesktopStatusError =
    desktopStatusError && desktopStatusError !== "signal: killed"
      ? desktopStatusError
      : null;
  const defaultSection = isConnected ? "clients" : "relay";

  const workspaceQuery = useQuery<Workspace[]>({
    queryKey: ["desktop-workspaces"],
    queryFn: async () => {
      const app = getApp();
      return (await app.ListWorkspaces()) ?? [];
    },
  });

  const createWorkspace = useMutation({
    mutationFn: async () => {
      const app = getApp();
      const directory = await app.SelectWorkspaceDirectory();
      if (!directory) {
        return null;
      }
      return await app.CreateWorkspace(directory);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["desktop-workspaces"] });
    },
  });

  const workspaces = workspaceQuery.data ?? [];

  const statusColor = isConnected
    ? "text-green-500"
    : storedUrl
      ? "text-yellow-500"
      : "text-muted-foreground";

  const StatusIcon = isConnected ? Wifi : WifiOff;
  const statusLabel = isConnected
    ? "Connected"
    : storedUrl
      ? "Disconnected"
      : "Not configured";

  const opencodeAvailable = desktopStatus?.opencode.available ?? false;
  const opencodeConnected = desktopStatus?.opencode.connected ?? false;
  const opencodeStatusColor = opencodeConnected
    ? "text-green-500"
    : opencodeAvailable
      ? "text-yellow-500"
      : "text-muted-foreground";
  const OpencodeStatusIcon = opencodeConnected ? Wifi : WifiOff;
  const opencodeStatusLabel = opencodeConnected
    ? "Connected"
    : "Disconnected";
  const codexAvailable = desktopStatus?.codex.available ?? false;
  const codexConnected = desktopStatus?.codex.connected ?? false;
  const codexStatusColor = codexConnected
    ? "text-green-500"
    : codexAvailable
      ? "text-yellow-500"
      : "text-muted-foreground";
  const CodexStatusIcon = codexConnected ? Wifi : WifiOff;
  const codexStatusLabel = codexConnected ? "Connected" : "Disconnected";
  const claudeAvailable = desktopStatus?.claude.available ?? false;
  const claudeConnected = desktopStatus?.claude.connected ?? false;
  const claudeStatusColor = claudeConnected
    ? "text-green-500"
    : claudeAvailable
      ? "text-yellow-500"
      : "text-muted-foreground";
  const cursorConnected = false;
  const ClaudeStatusIcon = claudeConnected ? Wifi : WifiOff;
  const CursorStatusIcon = cursorConnected ? Wifi : WifiOff;

  const handleDownloadNode = async () => {
    await downloadNode("");
    await refreshDesktopStatus();
  };

  const openConfigDialog = () => {
    setRelayUrl(storedUrl);
    setShowConfigDialog(true);
  };

  const handleCreatePairing = () => {
    if (!storedUrl) {
      return;
    }

    createPairing().then((data) => {
      if (data) {
        setPairingData({
          pairingUrl: data.pairingUrl,
          expiresAt: data.expiresAt,
          initialClientCount: clients.length,
        });
        setShowQrDialog(true);
      }
    });
  };

  useEffect(() => {
    if (!showQrDialog) {
      return;
    }

    void refreshClients();
    const interval = window.setInterval(() => {
      void refreshClients();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [refreshClients, showQrDialog]);

  useEffect(() => {
    if (!showQrDialog || !pairingData) {
      return;
    }

    if (clients.length <= pairingData.initialClientCount) {
      return;
    }

    setShowQrDialog(false);
    setPairingData(null);
    toast.success("Connection successful");
  }, [clients.length, pairingData, showQrDialog]);

  return (
    <div className="container mx-auto max-w-lg py-8">
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultSection}
        className="space-y-4"
      >
        {isConnected ? (
          <AccordionItem value="clients" className="rounded-lg border px-5">
            <AccordionTrigger className="py-5 hover:no-underline">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                Clients
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`flex items-center gap-2 text-sm ${statusColor}`}>
                  <StatusIcon className="h-4 w-4" />
                  {statusLabel}
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCreatePairing}
                        disabled={!storedUrl || isCreating}
                      >
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                        Pair
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Pair a new client</TooltipContent>
                  </Tooltip>

                  <Button variant="ghost" size="sm" onClick={refreshClients}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
              </div>

              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No clients connected
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {clients.map((client) => (
                    <li
                      key={client.connectionId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span>Mobile Client</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {client.connectionId}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>
        ) : null}

        <AccordionItem value="relay" className="rounded-lg border px-5">
          <AccordionTrigger className="py-5 hover:no-underline">
            <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Relay Server
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 text-sm ${statusColor}`}>
                <StatusIcon className="h-4 w-4" />
                {statusLabel}
              </div>

              <div className="inline-flex rounded-md shadow-sm" role="group">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-r-none border-r-0"
                      onClick={pingRelay}
                      disabled={!storedUrl || isPinging}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isPinging ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ping</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-none"
                      onClick={openConfigDialog}
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Configure</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="providers" className="rounded-lg border px-5">
          <AccordionTrigger className="py-5 hover:no-underline">
            <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Provider Status
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshDesktopStatus}
                disabled={isDesktopStatusLoading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isDesktopStatusLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-foreground">OpenCode</span>
              <div className={`flex items-center gap-2 text-sm ${opencodeStatusColor}`}>
                <OpencodeStatusIcon className="h-4 w-4" />
                <span>{opencodeStatusLabel}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-foreground">Codex</span>
              <div className={`flex items-center gap-2 text-sm ${codexStatusColor}`}>
                <CodexStatusIcon className="h-4 w-4" />
                <span>{codexStatusLabel}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-foreground">Claude Code</span>
              <div className={`flex items-center gap-2 text-sm ${claudeStatusColor}`}>
                <ClaudeStatusIcon className="h-4 w-4" />
                <span>{claudeConnected ? "Connected" : "Disconnected"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm text-foreground">Cursor SDK</span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CursorStatusIcon className="h-4 w-4" />
                <span>{cursorConnected ? "Connected" : "Disconnected"}</span>
              </div>
            </div>
          </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!nodeStatus?.compatible && !bridgeStatus?.running ? (
                <Button size="sm" onClick={handleDownloadNode} disabled={isDownloading}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {isDownloading ? "Setting up..." : "Setup Claude/Cursor Runtime"}
                </Button>
              ) : null}
            </div>
            {visibleNodeError && !nodeStatus?.compatible ? (
              <p className="mt-2 text-xs text-yellow-500">{visibleNodeError}</p>
            ) : null}
            {visibleBridgeError ? (
              <p className="mt-2 text-xs text-red-500">{visibleBridgeError}</p>
            ) : null}
            {visibleDesktopStatusError ? (
              <p className="mt-2 text-xs text-red-500">{visibleDesktopStatusError}</p>
            ) : null}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="workspaces" className="rounded-lg border px-5">
          <AccordionTrigger className="py-5 hover:no-underline">
            <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Workspaces
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => workspaceQuery.refetch()}
                disabled={workspaceQuery.isFetching}
                size="sm"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${workspaceQuery.isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                onClick={() => createWorkspace.mutate()}
                disabled={createWorkspace.isPending}
                size="sm"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                Add Workspace
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {workspaces.length === 0 && !workspaceQuery.isLoading ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No workspaces yet. Add a local folder to start managing it here.
                </div>
              ) : null}

              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="rounded-xl border bg-card/60 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <h2 className="truncate text-base font-medium">
                          {workspace.name}
                        </h2>
                      </div>
                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                        {workspace.directory}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>
                        Updated {new Date(workspace.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Relay</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Input
              placeholder="https://relay.example.com"
              type={showUrl ? "text" : "password"}
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              hint="Relay server URL for remote access"
              suffixButton={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="border border-l-0 border-input rounded-l-none hover:bg-transparent h-9 px-3"
                  onClick={() => setShowUrl(!showUrl)}
                >
                  {showUrl ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              }
            />

            <Button
              className="w-full"
              onClick={() => {
                void saveUrl(relayUrl);
                setShowConfigDialog(false);
              }}
              disabled={isSaving}
            >
              {isSaving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showQrDialog}
        onOpenChange={(open) => {
          setShowQrDialog(open);
          if (!open) {
            setPairingData(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to pair</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center py-4">
            {pairingData?.pairingUrl ? (
              <>
                <div className="rounded-lg border p-3 bg-white">
                  <QRCode
                    value={pairingData.pairingUrl}
                    size={180}
                    level="M"
                    includeMargin
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Expires {new Date(pairingData.expiresAt).toLocaleTimeString()}
                </p>
              </>
            ) : (
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
