CREATE TABLE `netbird_services` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`purpose` text NOT NULL,
	`domain` text NOT NULL,
	`mode` text NOT NULL,
	`target_port` integer NOT NULL,
	`listen_port` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `servers` ADD `geyser_public_port` integer;--> statement-breakpoint
ALTER TABLE `servers` ADD `netbird_name` text;