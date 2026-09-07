CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`base_currency` text NOT NULL,
	`masked_account` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`asset_type` text NOT NULL,
	`currency` text NOT NULL,
	`sector` text,
	`provider_symbol` text,
	`is_leveraged` integer DEFAULT false NOT NULL,
	`leverage_target` real,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assets_symbol_currency` ON `assets` (`symbol`,`currency`);--> statement-breakpoint
CREATE INDEX `idx_assets_type` ON `assets` (`asset_type`);--> statement-breakpoint
CREATE TABLE `benchmark_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`price_date` text NOT NULL,
	`close` real NOT NULL,
	`provider` text NOT NULL,
	`fetched_at` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_benchmark_symbol_date_provider` ON `benchmark_snapshots` (`symbol`,`price_date`,`provider`);--> statement-breakpoint
CREATE TABLE `cash_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`transaction_id` text,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`fx_to_base` real,
	`external` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cash_flows_account_date` ON `cash_flows` (`account_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`delay_description` text NOT NULL,
	`last_success_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `decision_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`thesis_id` text NOT NULL,
	`due_at` text NOT NULL,
	`horizon_days` integer NOT NULL,
	`expectation` text,
	`actual` text,
	`thesis_assessment` text,
	`timing_assessment` text,
	`sizing_assessment` text,
	`bias` text,
	`relative_qqq` real,
	`relative_spy` real,
	`process_grade` text,
	`confirmed` integer DEFAULT false NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`thesis_id`) REFERENCES `theses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_decision_reviews_due` ON `decision_reviews` (`due_at`,`confirmed`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`base_currency` text NOT NULL,
	`quote_currency` text NOT NULL,
	`rate_date` text NOT NULL,
	`rate` real NOT NULL,
	`provider` text NOT NULL,
	`fetched_at` text NOT NULL,
	`status` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fx_pair_date_provider` ON `fx_rates` (`base_currency`,`quote_currency`,`rate_date`,`provider`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`filename` text,
	`status` text NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`confirmed_at` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_date` text NOT NULL,
	`base_currency` text NOT NULL,
	`total_value` real NOT NULL,
	`net_contributions` real NOT NULL,
	`realized_pnl` real NOT NULL,
	`unrealized_pnl` real NOT NULL,
	`dividend_income` real NOT NULL,
	`fee_and_tax` real NOT NULL,
	`fx_pnl` real NOT NULL,
	`status` text NOT NULL,
	`session` text DEFAULT 'MORNING' NOT NULL,
	`created_at` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_portfolio_snapshot_date_currency_session` ON `portfolio_snapshots` (`snapshot_date`,`base_currency`,`session`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`cost_method` text NOT NULL,
	`quantity` real NOT NULL,
	`cost_base` real NOT NULL,
	`as_of` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_positions_account_asset_method` ON `positions` (`account_id`,`asset_id`,`cost_method`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`price_date` text NOT NULL,
	`fetched_at` text NOT NULL,
	`provider` text NOT NULL,
	`quoted_at` text,
	`session` text DEFAULT 'MORNING' NOT NULL,
	`data_quality` text DEFAULT 'OFFICIAL_CLOSE' NOT NULL,
	`is_delayed` integer DEFAULT false NOT NULL,
	`price` real,
	`nav` real,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_price_asset_date_provider_session` ON `price_snapshots` (`asset_id`,`price_date`,`provider`,`session`);--> statement-breakpoint
CREATE INDEX `idx_price_asset_date` ON `price_snapshots` (`asset_id`,`price_date`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `theses` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`decision_type` text NOT NULL,
	`opened_at` text NOT NULL,
	`horizon` text NOT NULL,
	`max_loss` real,
	`planned_weight` real,
	`confidence` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_theses_asset_status` ON `theses` (`asset_id`,`status`);--> statement-breakpoint
CREATE TABLE `thesis_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`thesis_id` text NOT NULL,
	`revised_at` text NOT NULL,
	`buy_reason` text NOT NULL,
	`mispricing` text,
	`catalysts` text,
	`risks` text NOT NULL,
	`invalidation` text NOT NULL,
	`sources` text,
	`status` text NOT NULL,
	`note` text,
	FOREIGN KEY (`thesis_id`) REFERENCES `theses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_thesis_revisions_thesis_date` ON `thesis_revisions` (`thesis_id`,`revised_at`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`asset_id` text,
	`type` text NOT NULL,
	`traded_at` text NOT NULL,
	`settlement_date` text,
	`quantity` real DEFAULT 0 NOT NULL,
	`unit_price` real,
	`currency` text NOT NULL,
	`fee` real DEFAULT 0 NOT NULL,
	`tax` real DEFAULT 0 NOT NULL,
	`fx_to_base` real,
	`total_amount` real,
	`source` text NOT NULL,
	`import_batch_id` text,
	`note` text,
	`reconciled` integer DEFAULT false NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_account_date` ON `transactions` (`account_id`,`traded_at`);--> statement-breakpoint
CREATE INDEX `idx_transactions_asset_date` ON `transactions` (`asset_id`,`traded_at`);--> statement-breakpoint
CREATE INDEX `idx_transactions_import_batch` ON `transactions` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `update_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`mode` text DEFAULT 'MORNING' NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`success_count` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`error_summary` text
);
--> statement-breakpoint
CREATE INDEX `idx_update_runs_started` ON `update_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `valuation_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`as_of_date` text NOT NULL,
	`provider` text NOT NULL,
	`market_cap` real,
	`trailing_pe` real,
	`forward_pe` real,
	`price_sales` real,
	`ev_ebitda` real,
	`earnings_yield` real,
	`revenue_growth` real,
	`eps_growth` real,
	`high_52w` real,
	`low_52w` real,
	`expense_ratio` real,
	`tracking_index` text,
	`leverage_target` real,
	`max_drawdown` real,
	`status` text NOT NULL,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_valuation_asset_date_provider` ON `valuation_snapshots` (`asset_id`,`as_of_date`,`provider`);