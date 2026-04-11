import { useState } from "react";
import { Link2, RefreshCw, Wifi, WifiOff } from "lucide-react";
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
import { useRelayHooks } from "../../shared/api/features/relay.api";

export const SettingsPage = () => {
  const [relayUrl, setRelayUrl] = useState("");
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [pairingData, setPairingData] = useState<{
    pairingUrl: string;
    expiresAt: string;
  } | null>(null);

  const {
    storedUrl,
    isConnected,
    saveUrl,
    createPairing,
    isSaving,
    isCreating,
  } = useRelayHooks();

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <h1 className="mb-8 text-2xl font-bold">Settings</h1>

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

          {isConnected ? (
            <div className="flex items-center gap-2 text-green-600 mb-4">
              <Wifi className="h-4 w-4" />
              <span className="text-sm font-medium">Connected</span>
            </div>
          ) : storedUrl && storedUrl !== "" ? (
            <div className="flex items-center gap-2 text-yellow-600 mb-4">
              <WifiOff className="h-4 w-4" />
              <span className="text-sm font-medium">
                Disconnected - URL saved but unreachable
              </span>
            </div>
          ) : null}

          <div className="space-y-4">
            <Input
              label="Relay Server URL"
              placeholder="https://relay.example.com"
              value={relayUrl || storedUrl || ""}
              onChange={(e) => setRelayUrl(e.target.value)}
              hint="Enter the relay server URL (e.g., https://relay.example.com)"
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
