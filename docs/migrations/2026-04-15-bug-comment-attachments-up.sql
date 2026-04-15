-- Bug comment attachments (UP)
-- Generated: 2026-04-15
-- Notes:
-- 1) 评论继续使用 bug_status_logs 作为主记录。
-- 2) 评论附件独立存储，避免混入 Bug 主附件区。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `bug_comment_attachments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bug_id` BIGINT NOT NULL COMMENT '关联Bug',
  `comment_log_id` BIGINT NOT NULL COMMENT '关联评论日志ID（bug_status_logs.id）',
  `file_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `file_ext` VARCHAR(50) DEFAULT NULL COMMENT '文件后缀',
  `file_size` BIGINT DEFAULT NULL COMMENT '文件大小',
  `mime_type` VARCHAR(100) DEFAULT NULL COMMENT 'MIME类型',
  `storage_provider` VARCHAR(50) NOT NULL DEFAULT 'ALIYUN_OSS' COMMENT '存储服务商',
  `bucket_name` VARCHAR(100) DEFAULT NULL COMMENT 'Bucket名称',
  `object_key` VARCHAR(500) NOT NULL COMMENT '对象Key',
  `object_url` VARCHAR(1000) DEFAULT NULL COMMENT '访问地址',
  `uploaded_by` BIGINT NOT NULL COMMENT '上传人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bug_comment_attachments_bug_id` (`bug_id`),
  KEY `idx_bug_comment_attachments_comment_log_id` (`comment_log_id`),
  KEY `idx_bug_comment_attachments_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Bug评论附件表';
