-- Bug comment threading and editing support (UP)
-- Generated: 2026-04-15
-- Notes:
-- 1) bug_status_logs 继续承载评论主记录。
-- 2) parent_comment_id 支持一层回复；edited_at 支持评论二次编辑。

SET NAMES utf8mb4;

ALTER TABLE `bug_status_logs`
  ADD COLUMN `parent_comment_id` BIGINT NULL DEFAULT NULL COMMENT '父评论日志ID，仅评论/回复使用' AFTER `remark`,
  ADD COLUMN `edited_at` DATETIME NULL DEFAULT NULL COMMENT '评论编辑时间' AFTER `parent_comment_id`,
  ADD KEY `idx_bug_status_logs_parent_comment_id` (`parent_comment_id`);
