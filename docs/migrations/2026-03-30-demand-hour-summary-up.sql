-- Demand hour summary fields (UP)
-- Generated: 2026-03-30
-- Purpose: add stored demand-level estimated/actual hour summaries and backfill existing data.

SET NAMES utf8mb4;

SET @sql_add_overall_estimated := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `work_demands` ADD COLUMN `overall_estimated_hours` DECIMAL(8,1) NOT NULL DEFAULT 0.0 COMMENT ''需求整体预估用时(h)'' AFTER `test_case_link`',
    'SELECT ''[skip] work_demands.overall_estimated_hours already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'overall_estimated_hours'
);
PREPARE stmt_add_overall_estimated FROM @sql_add_overall_estimated;
EXECUTE stmt_add_overall_estimated;
DEALLOCATE PREPARE stmt_add_overall_estimated;

SET @sql_add_overall_actual := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `work_demands` ADD COLUMN `overall_actual_hours` DECIMAL(8,1) NOT NULL DEFAULT 0.0 COMMENT ''需求整体实际用时(h)'' AFTER `overall_estimated_hours`',
    'SELECT ''[skip] work_demands.overall_actual_hours already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'work_demands'
    AND COLUMN_NAME = 'overall_actual_hours'
);
PREPARE stmt_add_overall_actual FROM @sql_add_overall_actual;
EXECUTE stmt_add_overall_actual;
DEALLOCATE PREPARE stmt_add_overall_actual;

UPDATE work_demands d
SET
  overall_estimated_hours = ROUND(
    COALESCE(
      CASE
        WHEN (
          COALESCE((
            SELECT SUM(CASE
              WHEN COALESCE(t.status, 'TODO') <> 'CANCELLED'
                AND COALESCE(t.personal_estimated_hours, 0) > 0
                THEN t.personal_estimated_hours
              ELSE 0
            END)
            FROM wf_process_tasks t
            WHERE t.instance_id = (
              SELECT i.id
              FROM wf_process_instances i
              WHERE i.biz_type = 'DEMAND'
                AND i.biz_id = d.id
                AND i.status <> 'TERMINATED'
              ORDER BY i.id DESC
              LIMIT 1
            )
          ), 0)
          + COALESCE((
            SELECT SUM(CASE
              WHEN COALESCE(l.log_status, 'IN_PROGRESS') <> 'CANCELLED'
                AND COALESCE(l.task_source, 'SELF') <> 'WORKFLOW_AUTO'
                AND COALESCE(l.personal_estimate_hours, 0) > 0
                THEN l.personal_estimate_hours
              ELSE 0
            END)
            FROM work_logs l
            WHERE l.demand_id = d.id
          ), 0)
        ) > 0
        THEN (
          COALESCE((
            SELECT SUM(CASE
              WHEN COALESCE(t.status, 'TODO') <> 'CANCELLED'
                AND COALESCE(t.personal_estimated_hours, 0) > 0
                THEN t.personal_estimated_hours
              ELSE 0
            END)
            FROM wf_process_tasks t
            WHERE t.instance_id = (
              SELECT i.id
              FROM wf_process_instances i
              WHERE i.biz_type = 'DEMAND'
                AND i.biz_id = d.id
                AND i.status <> 'TERMINATED'
              ORDER BY i.id DESC
              LIMIT 1
            )
          ), 0)
          + COALESCE((
            SELECT SUM(CASE
              WHEN COALESCE(l.log_status, 'IN_PROGRESS') <> 'CANCELLED'
                AND COALESCE(l.task_source, 'SELF') <> 'WORKFLOW_AUTO'
                AND COALESCE(l.personal_estimate_hours, 0) > 0
                THEN l.personal_estimate_hours
              ELSE 0
            END)
            FROM work_logs l
            WHERE l.demand_id = d.id
          ), 0)
        )
        ELSE COALESCE((
          SELECT SUM(CASE
            WHEN COALESCE(n.status, 'TODO') <> 'CANCELLED'
              THEN COALESCE(n.personal_estimated_hours, n.owner_estimated_hours, 0)
            ELSE 0
          END)
          FROM wf_process_instance_nodes n
          WHERE n.instance_id = (
            SELECT i.id
            FROM wf_process_instances i
            WHERE i.biz_type = 'DEMAND'
              AND i.biz_id = d.id
              AND i.status <> 'TERMINATED'
            ORDER BY i.id DESC
            LIMIT 1
          )
        ), 0)
      END,
      0
    ),
    1
  ),
  overall_actual_hours = ROUND(
    COALESCE(
      CASE
        WHEN COALESCE((
          SELECT SUM(CASE
            WHEN COALESCE(l.log_status, 'IN_PROGRESS') <> 'CANCELLED'
              THEN COALESCE(l.actual_hours, 0)
            ELSE 0
          END)
          FROM work_logs l
          WHERE l.demand_id = d.id
        ), 0) > 0
        THEN COALESCE((
          SELECT SUM(CASE
            WHEN COALESCE(l.log_status, 'IN_PROGRESS') <> 'CANCELLED'
              THEN COALESCE(l.actual_hours, 0)
            ELSE 0
          END)
          FROM work_logs l
          WHERE l.demand_id = d.id
        ), 0)
        ELSE COALESCE((
          SELECT SUM(CASE
            WHEN COALESCE(n.status, 'TODO') <> 'CANCELLED'
              THEN COALESCE(n.actual_hours, 0)
            ELSE 0
          END)
          FROM wf_process_instance_nodes n
          WHERE n.instance_id = (
            SELECT i.id
            FROM wf_process_instances i
            WHERE i.biz_type = 'DEMAND'
              AND i.biz_id = d.id
              AND i.status <> 'TERMINATED'
            ORDER BY i.id DESC
            LIMIT 1
          )
        ), 0)
      END,
      0
    ),
    1
  );
