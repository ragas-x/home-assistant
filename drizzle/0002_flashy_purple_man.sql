CREATE INDEX `idx_family_notes_open` ON `family_notes` (`completed`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_kitchen_timers_open` ON `kitchen_timers` (`completed`,`ends_at`);