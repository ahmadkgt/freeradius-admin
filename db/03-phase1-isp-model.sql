-- Phase 1: ISP / subscription model
-- Adds tables for service plans (profiles) and per-user subscription metadata.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS profiles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL UNIQUE,
  type ENUM('prepaid', 'postpaid', 'expired') NOT NULL DEFAULT 'prepaid',
  short_description TEXT,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  vat_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  duration_value INT NOT NULL DEFAULT 30,
  duration_unit ENUM('days', 'months', 'years') NOT NULL DEFAULT 'days',
  use_fixed_time TINYINT(1) NOT NULL DEFAULT 0,
  fixed_expiration_time TIME NULL,
  download_rate_kbps INT NULL,
  upload_rate_kbps INT NULL,
  pool_name VARCHAR(64) NULL,
  expired_next_profile_id INT NULL,
  awarded_reward_points DECIMAL(10, 2) NOT NULL DEFAULT 0,
  available_in_user_panel TINYINT(1) NOT NULL DEFAULT 0,
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  enable_sub_managers TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_next FOREIGN KEY (expired_next_profile_id)
    REFERENCES profiles (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subscriber_profiles (
  username VARCHAR(64) PRIMARY KEY,
  profile_id INT NULL,
  parent_manager_id INT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  expiration_at DATETIME NULL,
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  debt DECIMAL(12, 2) NOT NULL DEFAULT 0,
  first_name VARCHAR(64) NULL,
  last_name VARCHAR(64) NULL,
  email VARCHAR(128) NULL,
  phone VARCHAR(32) NULL,
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_subscriber_profile (profile_id),
  KEY idx_subscriber_parent (parent_manager_id),
  KEY idx_subscriber_expiration (expiration_at),
  CONSTRAINT fk_subscriber_profile FOREIGN KEY (profile_id)
    REFERENCES profiles (id) ON DELETE SET NULL
);

-- Sample seed: a few service plans matching the existing seed users.
INSERT IGNORE INTO profiles
  (name, type, short_description, unit_price, vat_percent, duration_value, duration_unit, download_rate_kbps, upload_rate_kbps)
VALUES
  ('Basic 5M',     'prepaid', 'Basic 5 Mbps plan, 30 days',    25000.00, 0.00, 30, 'days',  5000,  2000),
  ('Standard 10M', 'prepaid', 'Standard 10 Mbps plan, 30 days', 50000.00, 0.00, 30, 'days', 10000,  4000),
  ('Premium 25M',  'prepaid', 'Premium 25 Mbps plan, 30 days', 100000.00, 0.00, 30, 'days', 25000, 10000),
  ('VIP 50M',      'prepaid', 'VIP 50 Mbps unlimited',         200000.00, 0.00, 30, 'days', 50000, 25000);

-- Map seed users to plans + give them realistic expiration windows.
-- Uses INSERT ... ON DUPLICATE KEY UPDATE so re-running the seed is harmless.
INSERT INTO subscriber_profiles
  (username, profile_id, expiration_at, first_name, last_name, phone)
SELECT 'alice', p.id, NOW() + INTERVAL 25 DAY, 'Alice', 'Anderson', '+963900000001'
FROM profiles p WHERE p.name = 'Premium 25M'
ON DUPLICATE KEY UPDATE profile_id = VALUES(profile_id), expiration_at = VALUES(expiration_at);

INSERT INTO subscriber_profiles
  (username, profile_id, expiration_at, first_name, last_name, phone)
SELECT 'bob', p.id, NOW() + INTERVAL 10 DAY, 'Bob', 'Brown', '+963900000002'
FROM profiles p WHERE p.name = 'Standard 10M'
ON DUPLICATE KEY UPDATE profile_id = VALUES(profile_id), expiration_at = VALUES(expiration_at);

INSERT INTO subscriber_profiles
  (username, profile_id, expiration_at, first_name, last_name, phone)
SELECT 'charlie', p.id, NOW() + INTERVAL 2 DAY, 'Charlie', 'Clark', '+963900000003'
FROM profiles p WHERE p.name = 'Basic 5M'
ON DUPLICATE KEY UPDATE profile_id = VALUES(profile_id), expiration_at = VALUES(expiration_at);

INSERT INTO subscriber_profiles
  (username, profile_id, expiration_at, first_name, last_name, phone)
SELECT 'ahmad', p.id, NOW() + INTERVAL 60 DAY, 'Ahmad', 'Khalil', '+963900000004'
FROM profiles p WHERE p.name = 'VIP 50M'
ON DUPLICATE KEY UPDATE profile_id = VALUES(profile_id), expiration_at = VALUES(expiration_at);

INSERT INTO subscriber_profiles
  (username, profile_id, expiration_at, first_name, last_name, phone)
SELECT 'fatima', p.id, NOW() + INTERVAL 18 HOUR, 'Fatima', 'Hassan', '+963900000005'
FROM profiles p WHERE p.name = 'Premium 25M'
ON DUPLICATE KEY UPDATE profile_id = VALUES(profile_id), expiration_at = VALUES(expiration_at);

INSERT INTO subscriber_profiles
  (username, profile_id, expiration_at, first_name, last_name, phone)
SELECT 'omar', p.id, NOW() - INTERVAL 3 DAY, 'Omar', 'Othman', '+963900000006'
FROM profiles p WHERE p.name = 'Basic 5M'
ON DUPLICATE KEY UPDATE profile_id = VALUES(profile_id), expiration_at = VALUES(expiration_at);

INSERT INTO subscriber_profiles
  (username, profile_id, expiration_at, enabled, first_name, last_name, phone)
SELECT 'layla', p.id, NOW() + INTERVAL 90 DAY, 0, 'Layla', 'Lutfi', '+963900000007'
FROM profiles p WHERE p.name = 'VIP 50M'
ON DUPLICATE KEY UPDATE profile_id = VALUES(profile_id), expiration_at = VALUES(expiration_at), enabled = VALUES(enabled);
