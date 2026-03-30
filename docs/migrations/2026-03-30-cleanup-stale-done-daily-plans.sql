SELECT
  COUNT(*) AS stale_plan_count,
  ROUND(COALESCE(SUM(p.planned_hours), 0), 1) AS stale_plan_hours
FROM work_log_daily_plans p
INNER JOIN work_logs l ON l.id = p.log_id
WHERE COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
  AND p.plan_date > DATE(COALESCE(l.log_completed_at, l.updated_at))
  AND UPPER(COALESCE(p.source, '')) <> 'MANUAL';

SELECT
  UPPER(COALESCE(p.source, '')) AS plan_source,
  COUNT(*) AS stale_plan_count,
  ROUND(COALESCE(SUM(p.planned_hours), 0), 1) AS stale_plan_hours
FROM work_log_daily_plans p
INNER JOIN work_logs l ON l.id = p.log_id
WHERE COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
  AND p.plan_date > DATE(COALESCE(l.log_completed_at, l.updated_at))
  AND UPPER(COALESCE(p.source, '')) <> 'MANUAL'
GROUP BY UPPER(COALESCE(p.source, ''))
ORDER BY stale_plan_count DESC, plan_source ASC;

DELETE p
FROM work_log_daily_plans p
INNER JOIN work_logs l ON l.id = p.log_id
WHERE COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
  AND p.plan_date > DATE(COALESCE(l.log_completed_at, l.updated_at))
  AND UPPER(COALESCE(p.source, '')) <> 'MANUAL';

SELECT ROW_COUNT() AS deleted_rows;

SELECT
  COUNT(*) AS remaining_stale_plan_count,
  ROUND(COALESCE(SUM(p.planned_hours), 0), 1) AS remaining_stale_plan_hours
FROM work_log_daily_plans p
INNER JOIN work_logs l ON l.id = p.log_id
WHERE COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
  AND p.plan_date > DATE(COALESCE(l.log_completed_at, l.updated_at))
  AND UPPER(COALESCE(p.source, '')) <> 'MANUAL';
