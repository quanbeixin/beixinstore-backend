SET NAMES utf8mb4;

ALTER TABLE `matrix_package_side_notes`
  MODIFY COLUMN `content` MEDIUMTEXT NULL,
  MODIFY COLUMN `confirmed_content` MEDIUMTEXT NULL;
