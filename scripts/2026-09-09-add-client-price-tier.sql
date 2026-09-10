-- Run manually in Supabase (SQL editor or psql). Not executed automatically.
--
-- Adds an explicit price-tier column to Client, decoupled from `type`, so a client's
-- fallback price (used only when there's no negotiated row in ClientPrice for that
-- client + reference) can be resolved deterministically to Product.priceOwner /
-- priceB2B / priceB2C — without guessing from the client's name in application code.

ALTER TABLE "Client"
  ADD COLUMN "priceTier" TEXT NOT NULL DEFAULT 'B2C'
  CHECK ("priceTier" IN ('OWNER', 'B2B', 'B2C'));

-- Backfill existing clients from their current `type`.
UPDATE "Client" SET "priceTier" = 'B2B' WHERE "type" IN ('FIXED', 'DISTRIBUTOR');
UPDATE "Client" SET "priceTier" = 'B2C' WHERE "type" IN ('OCCASIONAL', 'DECORATOR', 'GENERAL');

-- Implecor gets the Owner tier specifically (adjust the name match if it differs in your data).
UPDATE "Client" SET "priceTier" = 'OWNER' WHERE name ILIKE 'Implecor%';

-- Verify before moving on:
-- SELECT id, name, type, "priceTier" FROM "Client" ORDER BY name;
