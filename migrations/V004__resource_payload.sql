-- ============================================================================
-- V004 · API 资源 payload 保真列
--
-- 目的：复杂聚合资源（流程订单 / 台账 / 结算 / 客户 / 合同 / 航次 / COA / 车次）
-- 前端对象字段多于显式列。payload jsonb 保存前端原始对象（往返零失真），
-- 显式列同时维护以保障 SQL 查询、视图与报表可用。GET 优先返回 payload。
-- ============================================================================

BEGIN;

ALTER TABLE trade.flow_order    ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE trade.order_ledger  ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE trade.settlement    ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE customer.customer   ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE contract.contract   ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE ocean.ocean_voyage  ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE ocean.ocean_coa     ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE ops.trip            ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE ops.trip_log        ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE trade.order_ledger_log ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE trade.flow_order_log   ADD COLUMN IF NOT EXISTS payload jsonb;

COMMIT;
