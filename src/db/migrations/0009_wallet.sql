-- Coins, Streak Shields and paid hints: a wallet per user and its ledger.
--
-- `wallet_transactions` is the ledger: every coin earned or spent, every shield bought or used, one row each. The unique
-- index on (user_id, key) is the idempotency guarantee: a reward, purchase or hint charge has a key made from the thing
-- it is for, so posting it twice stores it once. `wallets` holds the running totals so a spend can be checked and applied
-- in one statement; its CHECK constraints are the last line of defence against a negative balance or a negative shield count.
-- `link` ties a shield_use row to the purchase row of the shield it used; its partial unique index means one shield
-- can be used once. The calendar day a shield protects is the `ref` of its shield_use row, and the key `shield:use:<day>`
-- means a day is protected at most once.
-- Idempotent like 0001-0008: `npm run db:migrate` applies it in one transaction and a second run is a no-op.

CREATE TABLE IF NOT EXISTS "wallets" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"shields_owned" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "wallets_balance_nonnegative" CHECK ("balance" >= 0),
	CONSTRAINT "wallets_shields_range" CHECK ("shields_owned" >= 0 AND "shields_owned" <= 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"key" varchar(160) NOT NULL,
	"type" varchar(16) NOT NULL,
	"amount" integer NOT NULL,
	"shields_delta" integer DEFAULT 0 NOT NULL,
	"reason" varchar(200) NOT NULL,
	"ref" varchar(160),
	"link" varchar(160),
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN ('earning', 'spending', 'purchase', 'hint_charge', 'refund', 'shield_use')),
	CONSTRAINT "wallet_transactions_sign_check" CHECK (
		("type" IN ('earning', 'refund') AND "amount" > 0) OR
		("type" IN ('spending', 'purchase', 'hint_charge') AND "amount" < 0) OR
		("type" = 'shield_use' AND "amount" = 0)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_user_key_idx" ON "wallet_transactions" ("user_id", "key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_user_link_idx" ON "wallet_transactions" ("user_id", "link") WHERE "link" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_user_id_idx" ON "wallet_transactions" ("user_id", "id");
