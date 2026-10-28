ALTER TABLE `servers` ADD `public_port` integer;--> statement-breakpoint
ALTER TABLE `servers` ADD `voice_chat` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `servers` ADD `voice_public_port` integer;