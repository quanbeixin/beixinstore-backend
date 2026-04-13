-- Bug multi-assignees (UP)
-- Generated: 2026-04-13
-- Notes:
-- 1) Create relation table bug_assignees for multi-user assignment.
-- 2) Keep bugs.assignee_id as primary assignee for backward compatibility.
-- 3) Backfill historical data from bugs.assignee_id.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `bug_assignees` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bug_id` BIGINT NOT NULL COMMENT 'Bug ID',
  `user_id` BIGINT NOT NULL COMMENT '处理人用户ID',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否主处理人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bug_user` (`bug_id`, `user_id`),
  KEY `idx_bug_id` (`bug_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_bug_primary` (`bug_id`, `is_primary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug处理人关系表（支持多人）';

INSERT INTO `bug_assignees` (`bug_id`, `user_id`, `is_primary`, `created_at`)
SELECT
  b.id,
  b.assignee_id,
  1,
  NOW()
FROM `bugs` b
LEFT JOIN `bug_assignees` ba
  ON ba.bug_id = b.id
 AND ba.user_id = b.assignee_id
WHERE b.deleted_at IS NULL
  AND b.assignee_id IS NOT NULL
  AND ba.id IS NULL;

UPDATE `bug_assignees` ba
INNER JOIN `bugs` b ON b.id = ba.bug_id
SET ba.is_primary = CASE WHEN ba.user_id = b.assignee_id THEN 1 ELSE 0 END
WHERE b.deleted_at IS NULL;
