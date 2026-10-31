CREATE TABLE `account_assignments` (
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_member` ON `account_assignments` (`account_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sheet_tab` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_account` ON `accounts` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_assignments` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_member` ON `project_assignments` (`project_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`hourly_target` integer,
	`rate_cents` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#647c45' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`last_seen` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`task_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`project_id` text NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`video_id` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_video` ON `task_entries` (`project_id`,`account_id`,`video_id`);--> statement-breakpoint
CREATE INDEX `task_user_date` ON `task_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text,
	`start_ms` integer NOT NULL,
	`end_ms` integer,
	`rate_cents` integer NOT NULL,
	`source` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `task_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `time_user_start` ON `time_entries` (`user_id`,`start_ms`);--> statement-breakpoint
CREATE TABLE `timesheets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_start` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`status` text DEFAULT 'SUBMITTED' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`reviewed_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_week` ON `timesheets` (`user_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`google_sub` text,
	`role` text DEFAULT 'EMPLOYEE' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX one_running_timer ON time_entries(user_id) WHERE end_ms IS NULL;
--> statement-breakpoint
CREATE TRIGGER time_insert_guard BEFORE INSERT ON time_entries BEGIN
 SELECT CASE WHEN NEW.end_ms IS NOT NULL AND NEW.end_ms<=NEW.start_ms THEN RAISE(ABORT,'invalid_time') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM time_entries t WHERE t.user_id=NEW.user_id AND t.start_ms<COALESCE(NEW.end_ms,9223372036854775807) AND COALESCE(t.end_ms,9223372036854775807)>NEW.start_ms) THEN RAISE(ABORT,'overlapping_time') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=NEW.user_id AND s.status IN ('SUBMITTED','APPROVED') AND s.start_ms<COALESCE(NEW.end_ms,NEW.start_ms+1) AND s.end_ms>NEW.start_ms) THEN RAISE(ABORT,'week_locked') END;
END;
--> statement-breakpoint
CREATE TRIGGER time_update_guard BEFORE UPDATE ON time_entries BEGIN
 SELECT CASE WHEN NEW.end_ms IS NOT NULL AND NEW.end_ms<=NEW.start_ms THEN RAISE(ABORT,'invalid_time') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM time_entries t WHERE t.id!=OLD.id AND t.user_id=NEW.user_id AND t.start_ms<COALESCE(NEW.end_ms,9223372036854775807) AND COALESCE(t.end_ms,9223372036854775807)>NEW.start_ms) THEN RAISE(ABORT,'overlapping_time') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=NEW.user_id AND s.status IN ('SUBMITTED','APPROVED') AND ((s.start_ms<COALESCE(NEW.end_ms,NEW.start_ms+1) AND s.end_ms>NEW.start_ms) OR (s.start_ms<COALESCE(OLD.end_ms,OLD.start_ms+1) AND s.end_ms>OLD.start_ms))) THEN RAISE(ABORT,'week_locked') END;
END;
--> statement-breakpoint
CREATE TRIGGER task_insert_guard BEFORE INSERT ON task_entries BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=NEW.user_id AND s.status IN ('SUBMITTED','APPROVED') AND NEW.date>=s.week_start AND NEW.date<date(s.week_start,'+7 days')) THEN RAISE(ABORT,'week_locked') END;
END;
--> statement-breakpoint
CREATE TRIGGER task_update_guard BEFORE UPDATE ON task_entries BEGIN
 SELECT CASE WHEN NEW.version!=OLD.version+1 THEN RAISE(ABORT,'stale_task') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM timesheets s WHERE s.user_id=NEW.user_id AND s.status IN ('SUBMITTED','APPROVED') AND ((NEW.date>=s.week_start AND NEW.date<date(s.week_start,'+7 days')) OR (OLD.date>=s.week_start AND OLD.date<date(s.week_start,'+7 days')))) THEN RAISE(ABORT,'week_locked') END;
END;
--> statement-breakpoint
CREATE TRIGGER sheet_insert_guard BEFORE INSERT ON timesheets WHEN NEW.status='SUBMITTED' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM time_entries t WHERE t.user_id=NEW.user_id AND t.end_ms IS NULL AND t.start_ms<NEW.end_ms) THEN RAISE(ABORT,'running_timer') END;
END;
--> statement-breakpoint
CREATE TRIGGER sheet_update_guard BEFORE UPDATE ON timesheets WHEN NEW.status='SUBMITTED' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM time_entries t WHERE t.user_id=NEW.user_id AND t.end_ms IS NULL AND t.start_ms<NEW.end_ms) THEN RAISE(ABORT,'running_timer') END;
END;
