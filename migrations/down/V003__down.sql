-- ============================================================================
-- V003 回滚：恢复原外键行为 / 恢复 type CHECK / 删除合同附件表
-- ============================================================================

BEGIN;

-- 1. 删除合同附件表
DROP TABLE IF EXISTS contract.contract_material;

-- 2. 恢复 type CHECK
ALTER TABLE fleet.fleet_info
  ADD CONSTRAINT fleet_info_type_check
  CHECK (type IN ('自营', '合作', '外协'));
ALTER TABLE steel.steel_mill
  ADD CONSTRAINT steel_mill_type_check
  CHECK (type IN ('长期合作', '稳定合作', '潜在合作'));

-- 3. 恢复弱引用外键为默认 NO ACTION
DO $$
DECLARE
  v_schema  text;
  v_table   text;
  v_col     text;
  v_ref     text;
  v_conname text;
BEGIN
  FOR v_schema, v_table, v_col, v_ref IN
    SELECT * FROM (VALUES
      ('trade',   'flow_order',        'mine_id',      'mine.mine_info (id)'),
      ('ocean',   'ocean_voyage',      'mine_id',      'mine.mine_info (id)'),
      ('trade',   'order_ledger',      'flow_order_id','trade.flow_order (id)'),
      ('trade',   'order_ledger',      'contract_id',  'contract.contract (id)'),
      ('trade',   'order_ledger',      'mine_id',      'mine.mine_info (id)'),
      ('trade',   'order_ledger',      'voyage_id',    'ocean.ocean_voyage (id)'),
      ('trade',   'order_ledger_trip', 'trip_id',      'ops.trip (id)'),
      ('trade',   'settlement',        'order_id',     'trade.order_ledger (id)'),
      ('trade',   'settlement',        'contract_id',  'contract.contract (id)'),
      ('wh',      'wh_io_record',      'supplier_id',  'wh.wh_supplier (id)'),
      ('wh',      'wh_customs_record', 'supplier_id',  'wh.wh_supplier (id)')
    ) AS t(sch, tbl, col, ref)
  LOOP
    SELECT c.conname INTO v_conname
    FROM pg_constraint c
    JOIN pg_class cl    ON cl.oid = c.conrelid
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
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s',
        v_schema, v_table, v_conname, v_col, v_ref);
    END IF;
  END LOOP;
END $$;

COMMIT;
