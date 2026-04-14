import { useState } from "react";
import {
  Eye,
  EyeOff,
  Link2,
  RefreshCw,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { Button } from "../../shared/components/ui/button";
import { Input } from "../../shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/components/ui/dialog";
import {
  useRelayHooks,
  useConnectedClients,
} from "../../shared/api/features/relay.api";

export const HomePage = () => {
  const [relayUrl, setRelayUrl] = useState("");
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

  const {
    clients,
    isLoading: isLoadingClients,
    refresh: refreshClients,
  } = useConnectedClients();

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <h1 className="mb-8 text-2xl font-bold">Home</h1>

      <div className="space-y-6">
        <div className="rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Relay Connection</h2>
              <p className="text-sm text-muted-foreground">
                Connect to relay server for remote access
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            {isConnected ? (
              <div className="flex items-center gap-2 text-green-600">
                <Wifi className="h-4 w-4" />
                <span className="text-sm font-medium">Connected</span>
              </div>
            ) : storedUrl && storedUrl !== "" ? (
              <div className="flex items-center gap-2 text-yellow-600">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm font-medium">Disconnected</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm font-medium">Not configured</span>
              </div>
            )}
            {storedUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={pingRelay}
                disabled={isPinging}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${isPinging ? "animate-spin" : ""}`}
                />
                Ping
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <Input
              label="Relay Server URL"
              placeholder="https://relay.example.com"
              type={showUrl ? "text" : "password"}
              value={relayUrl || storedUrl || ""}
              onChange={(e) => setRelayUrl(e.target.value)}
              hint="Enter the relay server URL (e.g., https://relay.example.com)"
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

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const url = relayUrl || storedUrl;
                  if (url) {
                    saveUrl(url);
                  }
                }}
                disabled={!relayUrl && !storedUrl}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isSaving ? "animate-spin" : ""}`}
                />
                Save & Verify
              </Button>

              <Button
                variant="outline"
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
                <Link2 className="mr-2 h-4 w-4" />
                Generate QR Code
              </Button>
            </div>
          </div>
        </div>

        {isConnected && (
          <div className="rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Connected Clients</h2>
                  <p className="text-sm text-muted-foreground">
                    Mobile apps connected to relay
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshClients}
                disabled={isLoadingClients}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${isLoadingClients ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No mobile clients connected
              </p>
            ) : (
              <ul className="space-y-2">
                {clients.map((client) => (
                  <li
                    key={client.connectionId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span>Mobile Client</span>
                    <span className="text-muted-foreground">
                      ({client.connectionId})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pairing QR Code</DialogTitle>
            <DialogDescription>
              Scan this QR code with your mobile app to connect
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-4">
            {pairingData?.pairingUrl ? (
              <div className="text-center">
                <div className="mb-4 rounded-lg border p-4 bg-white">
                  <QRCode
                    value={pairingData.pairingUrl}
                    size={200}
                    level={"M"}
                    includeMargin={true}
                  />
                </div>
                <p className="text-sm text-muted-foreground break-all">
                  {pairingData.pairingUrl}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Expires: {new Date(pairingData.expiresAt).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQrDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
