SET NAMES utf8mb4;

CREATE TEMPORARY TABLE tmp_matrix_package_demands_to_delete (
  demand_id VARCHAR(64) PRIMARY KEY
) ENGINE=InnoDB;

INSERT INTO tmp_matrix_package_demands_to_delete (demand_id)
SELECT d.id
FROM work_demands d
WHERE d.name LIKE '【矩阵包生产】%'
  AND d.id <> 'REQ469';

UPDATE matrix_packages mp
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = mp.linked_demand_id
SET
  mp.linked_demand_id = NULL,
  mp.updated_at = NOW();

DELETE n
FROM wf_process_instance_nodes n
INNER JOIN wf_process_instances i
  ON i.id = n.instance_id
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = i.biz_id;

DELETE i
FROM wf_process_instances i
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = i.biz_id;

DELETE n
FROM pm_workflow_instance_nodes n
INNER JOIN pm_workflow_instances i
  ON i.id = n.instance_id
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = i.demand_id;

DELETE i
FROM pm_workflow_instances i
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = i.demand_id;

DELETE p
FROM work_demand_phases p
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = p.demand_id;

DELETE dc
FROM work_demand_communications dc
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = dc.demand_id;

DELETE d
FROM work_demands d
INNER JOIN tmp_matrix_package_demands_to_delete t
  ON t.demand_id = d.id;

SELECT COUNT(*) AS remaining_matrix_package_demands
FROM work_demands
WHERE name LIKE '【矩阵包生产】%';

SELECT id, name, status
FROM work_demands
WHERE name LIKE '【矩阵包生产】%'
ORDER BY id;
