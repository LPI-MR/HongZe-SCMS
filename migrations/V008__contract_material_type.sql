-- ============================================================================
-- V008 · 合同附件一单多档（按材料类型）
--
-- 目的：contracts.js 材料库每合同含 4 类材料（审批单 approval / 法律意见书
-- legal / 合同扫描件 contract / 其他 other），原 UNIQUE(contract_id) 一单一档
-- 无法区分类型，改为 UNIQUE(contract_id, mat_type)。
-- ============================================================================

BEGIN;

ALTER TABLE contract.contract_material
  ADD COLUMN IF NOT EXISTS mat_type text NOT NULL DEFAULT 'other';

ALTER TABLE contract.contract_material
  DROP CONSTRAINT IF EXISTS uq_contract_material;

ALTER TABLE contract.contract_material
  ADD CONSTRAINT uq_contract_material UNIQUE (contract_id, mat_type);

COMMIT;
