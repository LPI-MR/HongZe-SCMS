-- ============================================================================
-- V003 · API 联动改造配套（弱引用外键行为 + 合作类型放开 + 合同附件表）
--
-- 背景：前端 localStorage 时代删除主数据不受外键约束（对象冗余名称字段兜底）。
-- 为保证 API 全量替换 / 单条删除与原行为一致，本迁移：
--   1) 跨模块弱引用外键统一改为 ON DELETE SET NULL（业务冗余字段保留展示），
--      车次关联改为 CASCADE（车次删除即解除订单关联）；
--   2) 放开 fleet.type / steel.type 的 CHECK 枚举（原前端允许自由文本）；
--   3) 新增 contract.contract_material 合同附件表（原 hz_contract_materials 键）。
-- 幂等：全部使用 IF EXISTS / 动态查找，可重复执行。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 弱引用外键删除行为调整（动态查找约束名，避免依赖自动命名）
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_schema  text;
  v_table   text;
  v_col     text;
  v_ref     text;
  v_action  text;
  v_conname text;
  v_count   int;
BEGIN
  FOR v_schema, v_table, v_col, v_ref, v_action IN
    SELECT * FROM (VALUES
      ('trade',   'flow_order',        'mine_id',      'mine.mine_info (id)',       'SET NULL'),
      ('ocean',   'ocean_voyage',      'mine_id',      'mine.mine_info (id)',       'SET NULL'),
      ('trade',   'order_ledger',      'flow_order_id','trade.flow_order (id)',     'SET NULL'),
      ('trade',   'order_ledger',      'contract_id',  'contract.contract (id)',    'SET NULL'),
      ('trade',   'order_ledger',      'mine_id',      'mine.mine_info (id)',       'SET NULL'),
      ('trade',   'order_ledger',      'voyage_id',    'ocean.ocean_voyage (id)',   'SET NULL'),
      ('trade',   'order_ledger_trip', 'trip_id',      'ops.trip (id)',             'CASCADE'),
      ('trade',   'settlement',        'order_id',     'trade.order_ledger (id)',   'SET NULL'),
      ('trade',   'settlement',        'contract_id',  'contract.contract (id)',    'SET NULL'),
      ('wh',      'wh_io_record',      'supplier_id',  'wh.wh_supplier (id)',       'SET NULL'),
      ('wh',      'wh_customs_record', 'supplier_id',  'wh.wh_supplier (id)',       'SET NULL')
    ) AS t(sch, tbl, col, ref, act)
  LOOP
    SELECT c.conname INTO v_conname
    FROM pg_constraint c
    JOIN pg_class cl   ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = v_schema AND cl.relname = v_table
      AND c.conkey = (
        SELECT ARRAY[a.attnum] FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attname = v_col
      )
    LIMIT 1;

    IF v_conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', v_schema, v_table, v_conname);
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s ON DELETE %s',
        v_schema, v_table, v_conname, v_col, v_ref, v_action);
      RAISE NOTICE '外键 %.% -> % 已调整为 ON DELETE %', v_table, v_col, v_ref, v_action;
    ELSE
      RAISE NOTICE '警告：未找到外键 %.%（跳过）', v_table, v_col;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. 放开合作类型 CHECK（原前端为自由文本，保留录入灵活性）
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, n.nspname AS sch, cl.relname AS tbl
    FROM pg_constraint c
    JOIN pg_class cl    ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'c'
      AND ((n.nspname = 'fleet' AND cl.relname = 'fleet_info')
        OR (n.nspname = 'steel' AND cl.relname = 'steel_mill'))
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) AND a.attname = 'type')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.sch, r.tbl, r.conname);
    RAISE NOTICE '已放开 %.%.type 的 CHECK 约束（%）', r.sch, r.tbl, r.conname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. contract.contract_material 合同附件（原前端 hz_contract_materials 键）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract.contract_material (
  id          bigserial PRIMARY KEY,
  contract_id text NOT NULL REFERENCES contract.contract (id) ON DELETE CASCADE,
  filename    text,
  data_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contract_material UNIQUE (contract_id)
);
CREATE INDEX IF NOT EXISTS idx_contract_material_contract ON contract.contract_material (contract_id);

COMMIT;
