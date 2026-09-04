CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`slot` text NOT NULL,
	`dish` text NOT NULL,
	`time` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_meals_day_slot` ON `meals` (`day`,`slot`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`due_at` text NOT NULL,
	`recurrence` text,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
