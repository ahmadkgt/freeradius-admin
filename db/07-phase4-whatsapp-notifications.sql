-- Phase 4 — WhatsApp + notification templates + delivery log
--
-- Tables:
--   - whatsapp_sessions: tracks the connection state of the per-deployment
--     WhatsApp gateway (only one row for now: id=1).
--   - notification_templates: managers-authored message templates with
--     {{variable}} placeholders. AR + EN bodies share one template.
--   - notifications: append-only log of every queued / sent / failed
--     message, with the rendered text snapshot for auditability.
--
-- Idempotent: safe to re-run on an existing radius DB.

USE radius;

-- ---------------------------------------------------------------
-- whatsapp_sessions: gateway state. Single-row for the current
-- deployment; left as a table (with id PK) so future multi-gateway
-- setups can extend without a schema break.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(64) NOT NULL DEFAULT 'default',
    connected TINYINT(1) NOT NULL DEFAULT 0,
    jid VARCHAR(128) NULL,
    last_error VARCHAR(512) NULL,
    last_status_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_whatsapp_sessions_label (label)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO whatsapp_sessions (id, label) VALUES (1, 'default');

-- ---------------------------------------------------------------
-- notification_templates: human-friendly message templates.
-- `event` is the trigger; for ad-hoc sends, set event='custom'.
-- `body_ar` and `body_en` are interchangeable — the panel picks
-- whichever one matches the manager's UI locale, falling back to
-- the other if it's empty.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    event ENUM(
        'custom',
        'renewal_reminder',
        'expired',
        'debt_warning',
        'invoice_issued',
        'welcome'
    ) NOT NULL DEFAULT 'custom',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    body_ar TEXT NULL,
    body_en TEXT NULL,
    -- Optional event-specific knob (days_before_expiration for
    -- renewal_reminder, min_debt for debt_warning, ...). Stored as JSON
    -- so we don't have to keep migrating.
    config JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_notification_templates_event (event)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed a sensible AR-first set of templates. Idempotent because we key
-- on the (name) column from a SELECT.
INSERT INTO notification_templates (name, event, body_ar, body_en, config)
SELECT * FROM (
    SELECT
        'تذكير تجديد - 3 أيام' AS name,
        'renewal_reminder' AS event,
        'مرحبا {{full_name}}،\nاشتراكك ({{profile_name}}) ينتهي بتاريخ {{expiration_at}}. يرجى التجديد قبل ذلك لتجنب انقطاع الخدمة.' AS body_ar,
        'Hi {{full_name}},\nYour subscription ({{profile_name}}) ends on {{expiration_at}}. Please renew before then to avoid service interruption.' AS body_en,
        JSON_OBJECT('days_before', 3) AS config
) AS d
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE name = d.name);

INSERT INTO notification_templates (name, event, body_ar, body_en, config)
SELECT * FROM (
    SELECT
        'تذكير تجديد - يوم واحد' AS name,
        'renewal_reminder' AS event,
        'مرحبا {{full_name}}،\nتذكير: اشتراكك ينتهي غدا ({{expiration_at}}). يرجى التجديد لتجنب انقطاع الخدمة.' AS body_ar,
        'Hi {{full_name}},\nReminder: your subscription ends tomorrow ({{expiration_at}}). Please renew to avoid service interruption.' AS body_en,
        JSON_OBJECT('days_before', 1) AS config
) AS d
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE name = d.name);

INSERT INTO notification_templates (name, event, body_ar, body_en, config)
SELECT * FROM (
    SELECT
        'انتهاء الاشتراك' AS name,
        'expired' AS event,
        'مرحبا {{full_name}}،\nانتهى اشتراكك في {{expiration_at}}. يرجى التواصل لتجديد الاشتراك.' AS body_ar,
        'Hi {{full_name}},\nYour subscription expired on {{expiration_at}}. Please contact us to renew.' AS body_en,
        NULL AS config
) AS d
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE name = d.name);

INSERT INTO notification_templates (name, event, body_ar, body_en, config)
SELECT * FROM (
    SELECT
        'تنبيه دين' AS name,
        'debt_warning' AS event,
        'مرحبا {{full_name}}،\nلديك دين قائم بقيمة {{debt}} ل.س. يرجى التسوية في أقرب وقت.' AS body_ar,
        'Hi {{full_name}},\nYou have an outstanding balance of {{debt}} SYP. Please settle it as soon as possible.' AS body_en,
        JSON_OBJECT('min_debt', 1)
) AS d
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE name = d.name);

INSERT INTO notification_templates (name, event, body_ar, body_en, config)
SELECT * FROM (
    SELECT
        'فاتورة جديدة' AS name,
        'invoice_issued' AS event,
        'مرحبا {{full_name}}،\nصدرت لك فاتورة جديدة رقم {{invoice_number}} بقيمة {{amount}} ل.س.' AS body_ar,
        'Hi {{full_name}},\nA new invoice {{invoice_number}} for {{amount}} SYP has been issued.' AS body_en,
        NULL
) AS d
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE name = d.name);

INSERT INTO notification_templates (name, event, body_ar, body_en, config)
SELECT * FROM (
    SELECT
        'ترحيب بمشترك جديد' AS name,
        'welcome' AS event,
        'مرحبا {{full_name}}،\nأهلا بك! تم تفعيل اشتراكك ({{profile_name}}). أي استفسار، تواصل معنا في أي وقت.' AS body_ar,
        'Hi {{full_name}},\nWelcome! Your subscription ({{profile_name}}) has been activated. Reach out any time if you need help.' AS body_en,
        NULL
) AS d
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE name = d.name);

-- ---------------------------------------------------------------
-- notifications: append-only delivery log. We always store the
-- *rendered* body so historical messages stay readable even if the
-- template is later changed or deleted.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscriber_username VARCHAR(64) NULL,
    manager_id INT NOT NULL,
    template_id INT NULL,
    channel ENUM('whatsapp') NOT NULL DEFAULT 'whatsapp',
    event ENUM(
        'custom',
        'renewal_reminder',
        'expired',
        'debt_warning',
        'invoice_issued',
        'welcome'
    ) NOT NULL DEFAULT 'custom',
    phone VARCHAR(32) NULL,
    body TEXT NOT NULL,
    status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    error VARCHAR(512) NULL,
    provider_message_id VARCHAR(128) NULL,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_notifications_subscriber (subscriber_username),
    INDEX idx_notifications_manager (manager_id),
    INDEX idx_notifications_status (status),
    INDEX idx_notifications_event (event),
    INDEX idx_notifications_created (created_at),
    CONSTRAINT fk_notifications_manager FOREIGN KEY (manager_id)
        REFERENCES managers(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_template FOREIGN KEY (template_id)
        REFERENCES notification_templates(id) ON DELETE SET NULL
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The new permission strings (notifications.view / notifications.send /
-- notifications.templates.manage / notifications.whatsapp.manage) live in
-- backend/app/permissions.py and are granted by the panel UI. The root
-- manager skips the permission check entirely (is_root=1), so no DB
-- backfill is needed here.
