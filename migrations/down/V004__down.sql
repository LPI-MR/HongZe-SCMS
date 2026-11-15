-- ============================================================================
-- V004 回滚：删除 payload 保真列
-- ============================================================================

BEGIN;

ALTER TABLE trade.flow_order       DROP COLUMN IF EXISTS payload;
ALTER TABLE trade.order_ledger     DROP COLUMN IF EXISTS payload;
ALTER TABLE trade.settlement       DROP COLUMN IF EXISTS payload;
ALTER TABLE customer.customer      DROP COLUMN IF EXISTS payload;
ALTER TABLE contract.contract      DROP COLUMN IF EXISTS payload;
ALTER TABLE ocean.ocean_voyage     DROP COLUMN IF EXISTS payload;
ALTER TABLE ocean.ocean_coa        DROP COLUMN IF EXISTS payload;
ALTER TABLE ops.trip               DROP COLUMN IF EXISTS payload;
ALTER TABLE ops.trip_log           DROP COLUMN IF EXISTS payload;
ALTER TABLE trade.order_ledger_log DROP COLUMN IF EXISTS payload;
ALTER TABLE trade.flow_order_log   DROP COLUMN IF EXISTS payload;

COMMIT;
