-- ============================================================================
-- V005 · 客户模块 API 配套
--   1) 放开 customer.customer.customer_type 的 CHECK（存量并入的「待归类」主体
--      类型为空字符串，原 localStorage 时代合法，DB 不应拦截）；
--   2) 新增 customer.customer_pending_legacy（旧「待归类清单」存量载荷表，
--      保存前端原始对象，并入后清空）。
-- ============================================================================

BEGIN;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class cl    ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'c'
      AND n.nspname = 'customer' AND cl.relname = 'customer'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) AND a.attname = 'customer_type')
  LOOP
    EXECUTE format('ALTER TABLE customer.customer DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE '已放开 customer.customer.customer_type 的 CHECK（%）', r.conname;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS customer.customer_pending_legacy (
  id         bigserial PRIMARY KEY,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
