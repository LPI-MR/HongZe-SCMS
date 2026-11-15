-- V008 down · 恢复合同附件一单一档
BEGIN;
ALTER TABLE contract.contract_material DROP CONSTRAINT IF EXISTS uq_contract_material;
ALTER TABLE contract.contract_material ADD CONSTRAINT uq_contract_material UNIQUE (contract_id);
ALTER TABLE contract.contract_material DROP COLUMN IF EXISTS mat_type;
COMMIT;
