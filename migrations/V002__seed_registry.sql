-- ============================================================================
-- HongZe-SCMS 迁移 V002
-- 版本: V002  名称: seed_registry
-- 目的: 种子数据执行台账（scripts/seed.js 执行器使用，记录版本/校验和/耗时）
-- 幂等性: IF NOT EXISTS，可重复执行
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.seed_runs (
  version     text PRIMARY KEY,
  name        text NOT NULL,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  duration_ms integer
);
