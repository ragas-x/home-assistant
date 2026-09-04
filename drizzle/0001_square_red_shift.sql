CREATE TABLE `family_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kitchen_timers` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`ends_at` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
