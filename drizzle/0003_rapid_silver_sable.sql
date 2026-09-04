DROP INDEX `idx_family_notes_open`;--> statement-breakpoint
ALTER TABLE `family_notes` ADD `pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_family_notes_priority` ON `family_notes` (`completed`,`pinned`,`created_at`);