-- V006 回滚：撤销 API 布局补丁
DROP INDEX IF EXISTS trade.idx_flow_channel_order;
ALTER TABLE trade.flow_order_channel_detail DROP COLUMN IF EXISTS order_id;
ALTER TABLE trade.flow_order_channel_detail ALTER COLUMN plan_id SET NOT NULL;
ALTER TABLE wh.wh_stack DROP COLUMN IF EXISTS payload;
ALTER TABLE trade.order_ledger_trip     DROP COLUMN IF EXISTS sort_no;
ALTER TABLE trade.flow_order_shipping   DROP COLUMN IF EXISTS sort_no;
ALTER TABLE trade.flow_order_capacity   DROP COLUMN IF EXISTS sort_no;
