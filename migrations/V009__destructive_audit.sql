-- ============================================================================
-- V009 · 破坏性删除审计表（audit.destructive_log）
-- ----------------------------------------------------------------------------
-- 背景：客户数据「更新后消失」事故复盘 —— 全量替换（PUT）的 stale 清理
-- （DELETE WHERE pk NOT IN）属破坏性删除，曾误删存量行且仅留 console 埋点，
-- 无法事后回溯。本次为所有破坏性删除路径建立审计台账：
--   stale_cleanup   upsert 模式清理「提交列表之外的行」（缺行提交场景）
--   empty_wipe      upsert 模式「提交空列表」触发的清空全表
--   truncate_wipe   truncate 模式（流水/镜像类）PUT 前的全删
--   single_delete   DELETE /api/:res/:id 单条删除
-- 审计写入位于业务事务内，经 SAVEPOINT 兜底：审计失败不阻断业务写入。
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.destructive_log (
  id           bigserial    PRIMARY KEY,
  occurred_at  timestamptz  NOT NULL DEFAULT now(),
  table_name   text         NOT NULL,   -- 被清理的业务表（schema.table）
  op           text         NOT NULL,   -- stale_cleanup | empty_wipe | truncate_wipe | single_delete
  row_count    integer      NOT NULL DEFAULT 0,
  row_ids      jsonb,                   -- 被删行主键数组（truncate 场景为 null）
  detail       jsonb                    -- 预留：触发上下文扩展
);

COMMENT ON TABLE  audit.destructive_log IS '破坏性删除审计台账：全量替换 stale 清理 / 空列表清表 / truncate 全删 / 单条删除的留痕';
COMMENT ON COLUMN audit.destructive_log.op IS 'stale_cleanup=清理未提交行；empty_wipe=空列表清空全表；truncate_wipe=truncate 模式全删；single_delete=单条删除接口';

CREATE INDEX IF NOT EXISTS idx_destructive_log_table_time
  ON audit.destructive_log (table_name, occurred_at DESC);
