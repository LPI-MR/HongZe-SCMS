-- ============================================================================
-- V007 · 调度数据分析订单台账表
--
-- 目的：analytics/dispatch.js 的订单台账（订单号 + 总委托量）原存
-- localStorage 'hz-scms-orders-v1'，改造后落库 ops.analysis_order。
-- qty 允许 NULL（页面「委托量待填写」态）。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ops.analysis_order (
  id         text PRIMARY KEY,
  order_ref  text NOT NULL,
  qty        numeric(14,3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_order_ref ON ops.analysis_order (order_ref);

COMMIT;
