-- Feedback Dicts Migration (UP)
-- Generated: 2026-04-09
-- Scope:
-- 1) Add dict type: feedback_product
-- 2) Add dict type: feedback_channel
-- 3) Seed dict items with stable sort orders (A1 first)

SET NAMES utf8mb4;

INSERT INTO config_dict_types (type_key, type_name, description, enabled, is_builtin)
SELECT 'feedback_product', '用户反馈-产品', '用户反馈场景的产品下拉选项', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_types WHERE type_key = 'feedback_product'
);

INSERT INTO config_dict_types (type_key, type_name, description, enabled, is_builtin)
SELECT 'feedback_channel', '用户反馈-反馈渠道', '用户反馈场景的渠道下拉选项', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_types WHERE type_key = 'feedback_channel'
);

-- feedback_product items
INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'A1', 'A1', 10, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'A1'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'MINIMIX', 'Minimix', 20, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'MINIMIX'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'VIMI', 'Vimi', 30, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'VIMI'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'COUPLELENS', 'Couplelens', 40, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'COUPLELENS'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'VEEO', 'Veeo', 50, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'VEEO'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'HEYO', 'Heyo', 60, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'HEYO'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'POPDOLL', 'POPDoll', 70, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'POPDOLL'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'BEYO', 'Beyo', 80, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'BEYO'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_product', 'VIYO', 'Viyo', 90, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_product' AND item_code = 'VIYO'
);

-- feedback_channel items
INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_channel', 'EMAIL', '邮件', 10, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_channel' AND item_code = 'EMAIL'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_channel', 'FORM', '表单', 20, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_channel' AND item_code = 'FORM'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_channel', 'STORE_REVIEW', '商店评论', 30, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_channel' AND item_code = 'STORE_REVIEW'
);

INSERT INTO config_dict_items (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
SELECT 'feedback_channel', 'OTHER', '其他', 40, 1, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM config_dict_items WHERE type_key = 'feedback_channel' AND item_code = 'OTHER'
);

-- normalize sort order/name/enabled (idempotent)
UPDATE config_dict_items
SET item_name = 'A1', sort_order = 10, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'A1';

UPDATE config_dict_items
SET item_name = 'Minimix', sort_order = 20, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'MINIMIX';

UPDATE config_dict_items
SET item_name = 'Vimi', sort_order = 30, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'VIMI';

UPDATE config_dict_items
SET item_name = 'Couplelens', sort_order = 40, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'COUPLELENS';

UPDATE config_dict_items
SET item_name = 'Veeo', sort_order = 50, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'VEEO';

UPDATE config_dict_items
SET item_name = 'Heyo', sort_order = 60, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'HEYO';

UPDATE config_dict_items
SET item_name = 'POPDoll', sort_order = 70, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'POPDOLL';

UPDATE config_dict_items
SET item_name = 'Beyo', sort_order = 80, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'BEYO';

UPDATE config_dict_items
SET item_name = 'Viyo', sort_order = 90, enabled = 1
WHERE type_key = 'feedback_product' AND item_code = 'VIYO';

UPDATE config_dict_items
SET item_name = '邮件', sort_order = 10, enabled = 1
WHERE type_key = 'feedback_channel' AND item_code = 'EMAIL';

UPDATE config_dict_items
SET item_name = '表单', sort_order = 20, enabled = 1
WHERE type_key = 'feedback_channel' AND item_code = 'FORM';

UPDATE config_dict_items
SET item_name = '商店评论', sort_order = 30, enabled = 1
WHERE type_key = 'feedback_channel' AND item_code = 'STORE_REVIEW';

UPDATE config_dict_items
SET item_name = '其他', sort_order = 40, enabled = 1
WHERE type_key = 'feedback_channel' AND item_code = 'OTHER';
