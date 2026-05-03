-- Phase 3 follow-up — atomic invoice-number sequence counter.
--
-- The original Phase 3 migration left invoice numbering to a SELECT-MAX +
-- INSERT pattern, which races under concurrent requests (two callers
-- compute the same `INV-YYYY-NNNNNN`, the UNIQUE constraint then makes
-- the second insert fail with a 500). This migration adds a dedicated
-- counter table that is incremented atomically with
-- `INSERT ... ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)`
-- so each caller gets a unique, monotonically-increasing sequence value
-- without holding any cross-request locks.
--
-- The `last_seq` column stores the most recently allocated sequence number
-- for the year. Allocators always increment-and-return, so two concurrent
-- transactions serialize on the row's X-lock and each gets a distinct seq.
--
-- Idempotent: safe to re-run on an existing radius DB.

USE radius;

CREATE TABLE IF NOT EXISTS invoice_sequences (
    year SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
    last_seq INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill: seed the counter with MAX(seq) for any year that already
-- has invoices, so newly-issued numbers continue the existing sequence.
INSERT INTO invoice_sequences (year, last_seq)
SELECT
    CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(invoice_number, '-', 2), '-', -1) AS UNSIGNED) AS year,
    MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS last_seq
FROM invoices
WHERE invoice_number LIKE 'INV-%-%'
GROUP BY year
ON DUPLICATE KEY UPDATE
    last_seq = GREATEST(last_seq, VALUES(last_seq));
