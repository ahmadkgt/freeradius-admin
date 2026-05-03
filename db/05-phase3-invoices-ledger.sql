-- Phase 3 — Invoicing + per-manager ledger + payments
--
-- Idempotent: safe to re-run on an existing radius DB.

USE radius;

-- ---------------------------------------------------------------
-- invoices: subscriber-side billing.
-- One invoice = one charge on a subscriber (renewal, package change,
-- ad-hoc service). The owning manager (`manager_id`) is the manager
-- whose subtree the subscriber belongs to. The issuing manager
-- (`issued_by_manager_id`) is whoever clicked "create invoice".
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(32) NOT NULL UNIQUE,
    subscriber_username VARCHAR(64) NOT NULL,
    manager_id INT NOT NULL,
    issued_by_manager_id INT NULL,
    profile_id INT NULL,
    description VARCHAR(255) NULL,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    vat_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    vat_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status ENUM('pending', 'partially_paid', 'paid', 'voided', 'written_off')
        NOT NULL DEFAULT 'pending',
    issue_date DATE NOT NULL,
    due_date DATE NULL,
    period_start DATE NULL,
    period_end DATE NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_invoices_subscriber (subscriber_username),
    INDEX idx_invoices_manager (manager_id),
    INDEX idx_invoices_status (status),
    INDEX idx_invoices_issue_date (issue_date),
    CONSTRAINT fk_invoices_manager FOREIGN KEY (manager_id)
        REFERENCES managers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoices_issued_by FOREIGN KEY (issued_by_manager_id)
        REFERENCES managers(id) ON DELETE SET NULL,
    CONSTRAINT fk_invoices_profile FOREIGN KEY (profile_id)
        REFERENCES profiles(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------
-- invoice_payments: one invoice may have many payments
-- (cash, transfer, credit-from-balance, write-off).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    method ENUM('cash', 'transfer', 'balance', 'other') NOT NULL DEFAULT 'cash',
    paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_by_manager_id INT NULL,
    reference VARCHAR(128) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_invpay_invoice (invoice_id),
    INDEX idx_invpay_paid_at (paid_at),
    CONSTRAINT fk_invpay_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices(id) ON DELETE CASCADE,
    CONSTRAINT fk_invpay_recorded_by FOREIGN KEY (recorded_by_manager_id)
        REFERENCES managers(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------
-- manager_ledger: running balance log for each manager.
-- Every credit (top-up from parent) and debit (deduction, profit-share
-- transfer, etc.) is recorded here so the operator can audit trail.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manager_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manager_id INT NOT NULL,
    entry_type ENUM(
        'credit', 'debit', 'invoice_payment', 'profit_share',
        'manual_adjustment', 'opening_balance'
    ) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    related_invoice_id INT NULL,
    recorded_by_manager_id INT NULL,
    description VARCHAR(255) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ledger_manager (manager_id),
    INDEX idx_ledger_created_at (created_at),
    CONSTRAINT fk_ledger_manager FOREIGN KEY (manager_id)
        REFERENCES managers(id) ON DELETE CASCADE,
    CONSTRAINT fk_ledger_invoice FOREIGN KEY (related_invoice_id)
        REFERENCES invoices(id) ON DELETE SET NULL,
    CONSTRAINT fk_ledger_recorded_by FOREIGN KEY (recorded_by_manager_id)
        REFERENCES managers(id) ON DELETE SET NULL
);
