-- Phase 2 — Multi-level managers / resellers + 14-permission RBAC
--
-- Idempotent: safe to re-run on an existing radius DB.

USE radius;

-- ---------------------------------------------------------------
-- managers: hierarchy of operators (root admin + sub-managers).
-- Each manager logs into the panel directly (replaces admin_users).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS managers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NULL,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(128) NULL,
    phone VARCHAR(32) NULL,
    email VARCHAR(128) NULL,
    address TEXT NULL,
    notes TEXT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_root BOOLEAN NOT NULL DEFAULT FALSE,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    profit_share_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    max_users_quota INT NULL,
    permissions JSON NOT NULL,
    allowed_profile_ids JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_managers_parent (parent_id),
    CONSTRAINT fk_managers_parent FOREIGN KEY (parent_id)
        REFERENCES managers(id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------
-- Migrate the existing admin_users row into managers as the root.
-- (Only runs if admin_users exists and managers is empty.)
-- ---------------------------------------------------------------
INSERT INTO managers (
    id, parent_id, username, password_hash, full_name,
    is_root, enabled, balance, profit_share_percent,
    permissions, allowed_profile_ids
)
SELECT
    1,
    NULL,
    username,
    password_hash,
    'Root admin',
    TRUE,
    is_active,
    0,
    0,
    JSON_ARRAY('*'),
    JSON_ARRAY()
FROM admin_users
WHERE NOT EXISTS (SELECT 1 FROM managers)
ORDER BY id ASC
LIMIT 1;

-- The old admin_users table is no longer used; drop it.
DROP TABLE IF EXISTS admin_users;

-- ---------------------------------------------------------------
-- subscriber_profiles: link each subscriber to its owning manager.
-- The legacy parent_manager_id column (added in Phase 1 as a stub)
-- is replaced by a real FK column.
-- ---------------------------------------------------------------

-- Drop legacy stub column if it exists (ignore error if it doesn't).
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'subscriber_profiles'
      AND column_name = 'parent_manager_id'
);
SET @drop_legacy := IF(
    @col_exists > 0,
    'ALTER TABLE subscriber_profiles DROP COLUMN parent_manager_id',
    'SELECT 1'
);
PREPARE stmt FROM @drop_legacy;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add manager_id column if missing.
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'subscriber_profiles'
      AND column_name = 'manager_id'
);
SET @add_col := IF(
    @col_exists = 0,
    'ALTER TABLE subscriber_profiles ADD COLUMN manager_id INT NULL AFTER profile_id',
    'SELECT 1'
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index on manager_id (idempotent).
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'subscriber_profiles'
      AND index_name = 'idx_sub_manager'
);
SET @add_idx := IF(
    @idx_exists = 0,
    'ALTER TABLE subscriber_profiles ADD INDEX idx_sub_manager (manager_id)',
    'SELECT 1'
);
PREPARE stmt FROM @add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK on manager_id (idempotent).
SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'subscriber_profiles'
      AND constraint_name = 'fk_sub_manager'
);
SET @add_fk := IF(
    @fk_exists = 0,
    'ALTER TABLE subscriber_profiles ADD CONSTRAINT fk_sub_manager FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE stmt FROM @add_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Default existing subscribers to root manager (id=1).
UPDATE subscriber_profiles SET manager_id = 1 WHERE manager_id IS NULL;

-- ---------------------------------------------------------------
-- profiles: optional ownership column (NULL = global / available to all).
-- ---------------------------------------------------------------
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'profiles'
      AND column_name = 'owner_manager_id'
);
SET @add_col := IF(
    @col_exists = 0,
    'ALTER TABLE profiles ADD COLUMN owner_manager_id INT NULL AFTER enable_sub_managers',
    'SELECT 1'
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'profiles'
      AND constraint_name = 'fk_profile_owner'
);
SET @add_fk := IF(
    @fk_exists = 0,
    'ALTER TABLE profiles ADD CONSTRAINT fk_profile_owner FOREIGN KEY (owner_manager_id) REFERENCES managers(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE stmt FROM @add_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
