CREATE TABLE `panel_ops` (
	`server_id` text NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`server_id`, `uuid`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `minecraft_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `minecraft_uuid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_minecraft_uuid` ON `users` (`minecraft_uuid`);