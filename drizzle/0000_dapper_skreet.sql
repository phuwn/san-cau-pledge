CREATE TABLE `pledges` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`plan` text NOT NULL,
	`selected_dates` text NOT NULL,
	`seat_count` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reported_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pledges_reference_unique` ON `pledges` (`reference`);