-- Notification rules: merge template text into rule itself
-- Date: 2026-04-02

-- For MySQL versions without `ADD COLUMN IF NOT EXISTS`,
-- check existence before executing each statement.

ALTER TABLE notification_rules
  ADD COLUMN message_title VARCHAR(255) NULL COMMENT '规则通知标题模板' AFTER template_id;

ALTER TABLE notification_rules
  ADD COLUMN message_content TEXT NULL COMMENT '规则通知内容模板' AFTER message_title;

ALTER TABLE notification_rules
  ADD INDEX idx_notification_rules_event_enabled (event_type, enabled);

-- Execute the following statements only if `notification_rule` table exists:
-- ALTER TABLE notification_rule
--   ADD COLUMN message_title VARCHAR(255) NULL COMMENT '规则通知标题模板' AFTER receiver_config_json;
-- ALTER TABLE notification_rule
--   ADD COLUMN message_content TEXT NULL COMMENT '规则通知内容模板' AFTER message_title;
