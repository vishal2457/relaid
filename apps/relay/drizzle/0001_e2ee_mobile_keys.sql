ALTER TABLE "mobile_devices"
ADD COLUMN "device_public_key" text NOT NULL DEFAULT '',
ADD COLUMN "device_key_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "pairing_sessions"
ADD COLUMN "server_public_key" text NOT NULL DEFAULT '',
ADD COLUMN "server_key_id" text NOT NULL DEFAULT '',
ADD COLUMN "fingerprint" text NOT NULL DEFAULT '';
