-- Notification scheduler cursor table (UP)
-- 用途：为定时触发/到期提醒提供幂等去重，避免同一时间窗重复发送

CREATE TABLE IF NOT EXISTS notification_trigger_cursor (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id BIGINT UNSIGNED NOT NULL COMMENT '通知规则ID',
  trigger_key VARCHAR(255) NOT NULL COMMENT '触发幂等键（规则+对象+时间窗）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  expire_at DATETIME NULL COMMENT '过期时间（清理用）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_trigger_key (rule_id, trigger_key),
  KEY idx_expire_at (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知触发幂等游标';
