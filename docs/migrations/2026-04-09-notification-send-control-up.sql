-- Persist notification send-control config
-- Created at: 2026-04-09

CREATE TABLE IF NOT EXISTS notification_send_control (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY COMMENT '固定单行配置ID',
  send_mode VARCHAR(16) NOT NULL DEFAULT 'live' COMMENT '发送模式 live/shadow/whitelist',
  whitelist_open_ids TEXT NULL COMMENT '白名单用户 open_id（逗号分隔）',
  whitelist_chat_ids TEXT NULL COMMENT '白名单群 chat_id（逗号分隔）',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知发送控制配置';

INSERT INTO notification_send_control (
  id,
  send_mode,
  whitelist_open_ids,
  whitelist_chat_ids
)
VALUES (1, 'live', NULL, NULL)
ON DUPLICATE KEY UPDATE
  send_mode = send_mode;
