-- ============================================================================
-- HongZe-SCMS 迁移 V006 · api_layout_fixes
-- 目的：为通用 CRUD API（api/ 目录）补齐排序与保真所需的列
--   1) flow_order_capacity / flow_order_shipping / order_ledger_trip 补 sort_no
--      （前端数组顺序持久化，GET 按 sort_no 稳定返回提交顺序）
--   2) flow_order_channel_detail 与 plan_id 解耦：放开 NOT NULL，
--      新增 order_id（前端模型按 (orderId, channelType) 键控，挂到订单级联）
--   3) wh_stack 补 payload jsonb（垛位吨位 '2.5万吨' 等显示字符串往返保真）
-- 说明：全部语句幂等，可重复执行
-- ============================================================================

-- 1. 前端数组顺序 → sort_no
ALTER TABLE trade.flow_order_capacity ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0;
ALTER TABLE trade.flow_order_shipping   ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0;
ALTER TABLE trade.order_ledger_trip     ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0;

-- 2. 通道详情挂到订单（plan_id 保持兼容列但允许为空）
ALTER TABLE trade.flow_order_channel_detail ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE trade.flow_order_channel_detail ADD COLUMN IF NOT EXISTS order_id text
  REFERENCES trade.flow_order (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_flow_channel_order ON trade.flow_order_channel_detail (order_id);

-- 3. 垛位 payload 保真
ALTER TABLE wh.wh_stack ADD COLUMN IF NOT EXISTS payload jsonb;
