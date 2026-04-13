-- Bug watchers (UP)
-- Generated: 2026-04-13
-- Notes:
-- 1) Add bug_watchers relation table for optional followers.
-- 2) Supports multiple watchers per bug.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `bug_watchers` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bug_id` BIGINT NOT NULL COMMENT 'Bug ID',
  `user_id` BIGINT NOT NULL COMMENT '关注人用户ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bug_watcher` (`bug_id`, `user_id`),
  KEY `idx_bug_id` (`bug_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug关注人关系表';
