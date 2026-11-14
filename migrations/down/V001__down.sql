-- ============================================================================
-- HongZe-SCMS 回滚迁移 V001-down
-- 对应正向: V001__init_schema.sql
-- 幂等性: 全部 DROP IF EXISTS，可重复执行
-- 注意: CASCADE 删除将连带清除所有业务数据，执行前请确认
-- ============================================================================

-- 1. 视图
DROP VIEW IF EXISTS v_ocean_sync_view;
DROP VIEW IF EXISTS v_contract_dashboard;
DROP VIEW IF EXISTS v_dispatch_analysis;
DROP VIEW IF EXISTS v_order_tracking;
DROP VIEW IF EXISTS v_home_kpi;

-- 2. trade（依赖 contract/mine/ocean/ops，先删）
DROP TABLE IF EXISTS trade.settlement;
DROP TABLE IF EXISTS trade.order_ledger_log;
DROP TABLE IF EXISTS trade.order_ledger_trip;
DROP TABLE IF EXISTS trade.order_ledger;
DROP TABLE IF EXISTS trade.flow_order_log;
DROP TABLE IF EXISTS trade.flow_order_milestone;
DROP TABLE IF EXISTS trade.flow_order_shipping;
DROP TABLE IF EXISTS trade.flow_order_financial;
DROP TABLE IF EXISTS trade.flow_order_channel_detail;
DROP TABLE IF EXISTS trade.flow_order_plan;
DROP TABLE IF EXISTS trade.flow_order_capacity;
DROP TABLE IF EXISTS trade.flow_order_port;
DROP TABLE IF EXISTS trade.flow_order;

-- 3. ops
DROP TABLE IF EXISTS ops.trip_log;
DROP TABLE IF EXISTS ops.trip;

-- 4. contract
DROP TABLE IF EXISTS contract.contract_template;
DROP TABLE IF EXISTS contract.contract;

-- 5. customer
DROP TABLE IF EXISTS customer.customer_unified;
DROP TABLE IF EXISTS customer.customer;

-- 6. steel / fleet
DROP TABLE IF EXISTS steel.steel_mill;
DROP TABLE IF EXISTS fleet.fleet_info;

-- 7. wh
DROP TABLE IF EXISTS wh.wh_ore_catalog;
DROP TABLE IF EXISTS wh.wh_customs_record;
DROP TABLE IF EXISTS wh.wh_io_record;
DROP TABLE IF EXISTS wh.wh_stack;
DROP TABLE IF EXISTS wh.wh_supplier;

-- 8. transfer
DROP TABLE IF EXISTS transfer.transfer_yard;
DROP TABLE IF EXISTS transfer.transfer_station;

-- 9. rail
DROP TABLE IF EXISTS rail.rail_contact;
DROP TABLE IF EXISTS rail.rail_supplier;

-- 10. port
DROP TABLE IF EXISTS port.port_channel;
DROP TABLE IF EXISTS port.port_zone;
DROP TABLE IF EXISTS port.port_info;

-- 11. ocean
DROP TABLE IF EXISTS ocean.ocean_coa_item;
DROP TABLE IF EXISTS ocean.ocean_coa;
DROP TABLE IF EXISTS ocean.ocean_spot;
DROP TABLE IF EXISTS ocean.ocean_voyage_sync;
DROP TABLE IF EXISTS ocean.ocean_voyage;

-- 12. mine
DROP TABLE IF EXISTS mine.mine_partner;
DROP TABLE IF EXISTS mine.mine_price_ref;
DROP TABLE IF EXISTS mine.mine_product;
DROP TABLE IF EXISTS mine.mine_info;

-- 13. pricing
DROP TABLE IF EXISTS pricing.iron_ore_index;
DROP TABLE IF EXISTS pricing.rail_price_index;
DROP TABLE IF EXISTS pricing.truck_price_index;

-- 14. meta（业务字典删除；schema_migrations 为迁移台账元数据，
--     由执行器维护 reverted_at 标记，回滚时保留不删）
DROP TABLE IF EXISTS meta.dict_entry;

-- 15. 函数
DROP FUNCTION IF EXISTS meta.fn_touch_updated_at();

-- 16. 业务 Schema（CASCADE 兜底清空残留对象；meta 由执行器管理保留）
DROP SCHEMA IF EXISTS pricing CASCADE;
DROP SCHEMA IF EXISTS ops CASCADE;
DROP SCHEMA IF EXISTS trade CASCADE;
DROP SCHEMA IF EXISTS contract CASCADE;
DROP SCHEMA IF EXISTS customer CASCADE;
DROP SCHEMA IF EXISTS steel CASCADE;
DROP SCHEMA IF EXISTS fleet CASCADE;
DROP SCHEMA IF EXISTS wh CASCADE;
DROP SCHEMA IF EXISTS transfer CASCADE;
DROP SCHEMA IF EXISTS rail CASCADE;
DROP SCHEMA IF EXISTS port CASCADE;
DROP SCHEMA IF EXISTS ocean CASCADE;
DROP SCHEMA IF EXISTS mine CASCADE;
