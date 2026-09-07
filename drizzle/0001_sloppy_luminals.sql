DROP INDEX `uq_portfolio_snapshot_date_currency_session`;--> statement-breakpoint
ALTER TABLE `portfolio_snapshots` ADD `owner_id` text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_portfolio_owner_date_currency_session` ON `portfolio_snapshots` (`owner_id`,`snapshot_date`,`base_currency`,`session`);--> statement-breakpoint
DROP INDEX `uq_price_asset_date_provider_session`;--> statement-breakpoint
ALTER TABLE `price_snapshots` ADD `owner_id` text DEFAULT 'GLOBAL' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_price_owner_asset_date_provider_session` ON `price_snapshots` (`owner_id`,`asset_id`,`price_date`,`provider`,`session`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `owner_id` text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_accounts_owner` ON `accounts` (`owner_id`);--> statement-breakpoint
ALTER TABLE `import_batches` ADD `owner_id` text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_import_batches_owner_created` ON `import_batches` (`owner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `theses` ADD `owner_id` text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_theses_owner_status` ON `theses` (`owner_id`,`status`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `owner_id` text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_transactions_owner_date` ON `transactions` (`owner_id`,`traded_at`);
