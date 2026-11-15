-- ============================================================================
-- V005 回滚：恢复 customer_type CHECK / 删除旧待归类清单表
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS customer.customer_pending_legacy;

ALTER TABLE customer.customer
  ADD CONSTRAINT customer_customer_type_check
  CHECK (customer_type IN ('集采贸易商', '现货贸易商', '下游客户'));

COMMIT;
