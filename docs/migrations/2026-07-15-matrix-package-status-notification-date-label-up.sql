SET NAMES utf8mb4;

UPDATE notification_rules
SET message_content = REPLACE(
  message_content,
  '预计冷备完成时间：${expected_cold_ready_date}',
  '${status_date_label}：${status_date}'
)
WHERE biz_domain = 'matrix_package'
  AND event_type = 'matrix_package_status_change'
  AND message_content LIKE '%预计冷备完成时间：${expected_cold_ready_date}%';
