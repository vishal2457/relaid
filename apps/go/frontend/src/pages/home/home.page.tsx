import { useState } from "react";
import {
  Eye,
  EyeOff,
  Link2,
  RefreshCw,
  Settings,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { Link } from "react-router-dom";
import { Button } from "../../shared/components/ui/button";
import { Input } from "../../shared/components/ui/input";
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
} from "../../shared/api/features/relay.api";
import { ROUTES_PATH } from "../../routes/routes";

export const HomePage = () => {
  const [relayUrl, setRelayUrl] = useState("");
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [pairingData, setPairingData] = useState<{
    pairingUrl: string;
    expiresAt: string;
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

  const openConfigDialog = () => {
    setRelayUrl(storedUrl);
    setShowConfigDialog(true);
  };

  return (
    <div className="container mx-auto max-w-lg py-8">
      <div className="space-y-6">
        <section className="rounded-lg border p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Relay
          </h2>

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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-l-none border-l-0"
                    onClick={() => {
                      if (storedUrl) {
                        createPairing().then((data) => {
                          if (data) {
                            setPairingData({
                              pairingUrl: data.pairingUrl,
                              expiresAt: data.expiresAt,
                            });
                            setShowQrDialog(true);
                          }
                        });
                      }
                    }}
                    disabled={!storedUrl || isCreating}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pair</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </section>

        <section className="rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              OpenCode
            </h2>

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

          <div className={`mt-4 flex items-center gap-2 text-sm ${opencodeStatusColor}`}>
            <OpencodeStatusIcon className="h-4 w-4" />
            <span>{opencodeStatusLabel}</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Start OpenCode on this desktop first, then press refresh here. Once
            it shows connected, pair the mobile app from the Relay section above
            and the model picker in mobile will populate automatically.
          </p>
          {desktopStatusError ? (
            <p className="mt-2 text-xs text-red-500">{desktopStatusError}</p>
          ) : null}
        </section>

        {isConnected && (
          <section className="rounded-lg border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Clients
              </h2>
              <Button variant="ghost" size="sm" onClick={refreshClients}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
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
          </section>
        )}
      </div>

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

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
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
