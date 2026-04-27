CREATE TABLE "expo_push_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"server_secret_hash" text,
	"last_connected" timestamp,
	"is_connected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" text,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pairing_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"claimed_device_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "expo_push_tokens" ADD CONSTRAINT "expo_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_servers" ADD CONSTRAINT "local_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_server_id_local_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."local_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_sessions" ADD CONSTRAINT "pairing_sessions_server_id_local_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."local_servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_sessions" ADD CONSTRAINT "pairing_sessions_claimed_device_id_mobile_devices_id_fk" FOREIGN KEY ("claimed_device_id") REFERENCES "public"."mobile_devices"("id") ON DELETE no action ON UPDATE no action;