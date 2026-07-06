SET NAMES utf8mb4;

ALTER TABLE `matrix_packages`
  DROP COLUMN `progress`,
  DROP COLUMN `current_stage`,
  DROP COLUMN `risk_note`,
  DROP COLUMN `remark`;
