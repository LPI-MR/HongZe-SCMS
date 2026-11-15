-- ============================================================================
-- HongZe-SCMS 种子 S002 · 交易与指数数据
-- 来源: 系统内置演示数据（订单台账/结算/日志/调度车次/价格指数）
-- 幂等: 可重复执行（台账/结算/车次 ON CONFLICT DO UPDATE，日志/指数 DELETE+INSERT）
-- 依赖: S001__base_seed.sql 已应用（合同/矿山/航次/车次外键）
-- 事务: 由 scripts/seed.js 执行器统一包裹 BEGIN/COMMIT，本文件不自带
-- ============================================================================
-- ---- 1. ops.trip（12 车次，全局序号 seq=13 存 meta.dict_entry sys/trip_seq）----
-- 跨系统联动基准：order_ref 统一引用 trade.order_ledger.order_code（HZ 单号），
-- cargo 与对应台账订单货名一致（字段直接映射，见 docs/系统使用说明.md 联动章节）；
-- 节点进度与台账状态自洽（关联车次未全发出 → 执行中；有车次发出 → 已发运；全部到库 → 已完成）
INSERT INTO ops.trip
  (id, mode, from_station, to_station, cargo, tons, node_index, depart_time, order_ref, actual_tons)
VALUES
  ('YS1013-001', 'rail', '淮安南', '郑州北', '纽曼粉', 3200, 0, '2026-11-13T06:44:11.930Z', 'HZ202609140001', NULL),
  ('YS1013-002', 'rail', '连云港东', '西安西', 'PB粉', 2800, 2, '2026-11-13T06:28:11.930Z', 'HZ202608300001', NULL),
  ('YS1013-003', 'rail', '新沂', '武汉北', '纽曼粉', 1900, 3, '2026-11-13T06:15:11.930Z', 'HZ202609140001', NULL),
  ('YS1013-004', 'rail', '徐州北', '成都北', 'PB粉', 2600, 5, '2026-11-13T05:52:11.930Z', 'HZ202608300001', NULL),
  ('YS1012-018', 'rail', '淮安南', '郑州北', 'PB粉', 3100, 7, '2026-11-13T04:44:11.930Z', 'HZ202608300001', 3050),
  ('YS1013-005', 'inter', '淮安东', '洛阳西', '钢坯', 2200, 1, '2026-11-13T06:35:11.930Z', 'HZ202610140002', NULL),
  ('YS1013-006', 'inter', '宿迁', '邯郸南', '卡拉加斯粉', 2400, 3, '2026-11-13T06:09:11.930Z', 'HZ202609140002', NULL),
  ('YS1013-007', 'inter', '淮安东', '石家庄南', '钢坯', 3000, 3, '2026-11-13T05:35:11.930Z', 'HZ202610140002', NULL),
  ('YS1012-021', 'inter', '宿迁', '邯郸南', '卡拉加斯粉', 1800, 3, '2026-11-13T04:12:11.930Z', 'HZ202609140002', NULL),
  ('YS1013-008', 'road', '淮安', '南京', '钢坯', 32, 0, '2026-11-13T06:40:11.930Z', 'HZ202610140001', NULL),
  ('YS1013-009', 'road', '宿迁', '合肥', '钢坯', 28, 1, '2026-11-13T06:03:11.930Z', 'HZ202610140001', NULL),
  ('YS1012-025', 'road', '连云港', '徐州', '超特粉', 35, 2, '2026-11-13T04:37:11.930Z', 'HZ202608150001', 35.4)
ON CONFLICT (id) DO UPDATE SET
  mode = EXCLUDED.mode, from_station = EXCLUDED.from_station, to_station = EXCLUDED.to_station,
  cargo = EXCLUDED.cargo, tons = EXCLUDED.tons, node_index = EXCLUDED.node_index,
  depart_time = EXCLUDED.depart_time, order_ref = EXCLUDED.order_ref, actual_tons = EXCLUDED.actual_tons;

-- ---- 2. trade.order_ledger（9 单，含 contract/mine/voyage 外键关联）----
INSERT INTO trade.order_ledger
  (id, order_code, contract_id, contract_code, mine_id, mine_name, voyage_id, customer,
   cargo_name, cargo_qty, amount, sign_date, plan_end_date, status, remark, created_by, created_at, updated_at)
VALUES
  ('o-seed-001', 'HZ202608150001', 'c-seed-001', 'HZ-2026-001', 'mmwemahbc', '福斯特库', 'vmwemahcm', '武安市鑫源矿业有限公司',
   '超特粉', 175000, 10850000, DATE '2026-08-15', DATE '2026-11-08', '已完成',
   '已交付完毕，客户验收通过', '系统预置', to_timestamp(1786776611942 / 1000.0), to_timestamp(1794379811942 / 1000.0)),
  ('o-seed-002', 'HZ202608300001', 'c-seed-001', 'HZ-2026-001', 'mmwemahb9', '力拓', 'vmwemahcj', '武安市鑫源矿业有限公司',
   'PB粉', 170000, 10540000, DATE '2026-08-30', DATE '2026-12-13', '已发运',
   '澳矿进口，港口直发武安', '系统预置', to_timestamp(1788072611942 / 1000.0), to_timestamp(1788072611942 / 1000.0)),
  ('o-seed-003', 'HZ202609140001', 'c-seed-001', 'HZ-2026-001', 'mmwemahba', '必和必拓', 'vmwemahck', '武安市鑫源矿业有限公司',
   '纽曼粉', 180000, 11160000, DATE '2026-09-14', DATE '2026-12-28', '执行中',
   '待装船，疏港计划已排定', '系统预置', to_timestamp(1789368611942 / 1000.0), to_timestamp(1789368611942 / 1000.0)),
  ('o-seed-004', 'HZ202609140002', 'c-seed-001', 'HZ-2026-001', 'mmwemahbb', '淡水河谷', 'vmwemahcl', '武安市鑫源矿业有限公司',
   '卡拉加斯粉', 300000, 19500000, DATE '2026-09-14', DATE '2027-01-02', '执行中',
   '巴西矿进口，青岛港卸货', '系统预置', to_timestamp(1789368611942 / 1000.0), to_timestamp(1789368611942 / 1000.0)),
  ('o-seed-005', 'HZ202610140001', 'c-seed-002', 'HZ-2026-002', NULL, NULL, NULL, '河北新金钢铁有限公司',
   '钢坯', 35000, 8400000, DATE '2026-10-14', DATE '2026-12-23', '已发运',
   '汽运分批配送', '系统预置', to_timestamp(1791960611942 / 1000.0), to_timestamp(1791960611942 / 1000.0)),
  ('o-seed-006', 'HZ202610140002', 'c-seed-002', 'HZ-2026-002', NULL, NULL, NULL, '河北新金钢铁有限公司',
   '钢坯', 40000, 9600000, DATE '2026-10-14', DATE '2027-01-12', '执行中',
   '华北区域销售，分批交货', '系统预置', to_timestamp(1791960611942 / 1000.0), to_timestamp(1791960611942 / 1000.0)),
  ('o-seed-007', 'HZ202610140003', 'c-seed-004', 'HZ-2026-004', NULL, NULL, NULL, '河北陆港保税物流有限公司',
   '港口仓储服务', 50000, 1520000, DATE '2026-10-14', DATE '2027-03-13', '待确认',
   '中转仓储服务框架订单', '系统预置', to_timestamp(1791960611942 / 1000.0), to_timestamp(1791960611942 / 1000.0)),
  ('o-seed-008', 'HZ202610290001', 'c-seed-002', 'HZ-2026-002', 'mmwemahbd', '西芒杜', NULL, '河北新金钢铁有限公司',
   '高品位块矿', 15000, 4200000, DATE '2026-10-29', DATE '2026-12-13', '已终止',
   '客户需求变更，双方协商终止', '系统预置', to_timestamp(1793256611942 / 1000.0), to_timestamp(1793256611942 / 1000.0)),
  ('o-seed-009', 'HZ202611100001', 'c-seed-002', 'HZ-2026-002', NULL, NULL, NULL, '河北新金钢铁有限公司',
   '钢坯', 20000, 4800000, DATE '2026-11-10', DATE '2027-02-11', '待确认',
   '新增补库需求，待评审确认', '系统预置', to_timestamp(1794293411942 / 1000.0), to_timestamp(1794293411942 / 1000.0))
ON CONFLICT (order_code) DO UPDATE SET
  contract_id = EXCLUDED.contract_id, contract_code = EXCLUDED.contract_code,
  mine_id = EXCLUDED.mine_id, mine_name = EXCLUDED.mine_name, voyage_id = EXCLUDED.voyage_id,
  customer = EXCLUDED.customer, cargo_name = EXCLUDED.cargo_name, cargo_qty = EXCLUDED.cargo_qty,
  amount = EXCLUDED.amount, sign_date = EXCLUDED.sign_date, plan_end_date = EXCLUDED.plan_end_date,
  status = EXCLUDED.status, remark = EXCLUDED.remark, updated_at = EXCLUDED.updated_at;

-- ---- 2.1 trade.order_ledger_trip（12 条订单-车次关联，与 ops.trip.order_ref 一致：跨系统联动基准）----
DELETE FROM trade.order_ledger_trip;
INSERT INTO trade.order_ledger_trip (ledger_id, trip_id)
VALUES
  ('o-seed-001', 'YS1012-025'),
  ('o-seed-002', 'YS1013-002'),
  ('o-seed-002', 'YS1013-004'),
  ('o-seed-002', 'YS1012-018'),
  ('o-seed-003', 'YS1013-001'),
  ('o-seed-003', 'YS1013-003'),
  ('o-seed-004', 'YS1013-006'),
  ('o-seed-004', 'YS1012-021'),
  ('o-seed-005', 'YS1013-008'),
  ('o-seed-005', 'YS1013-009'),
  ('o-seed-006', 'YS1013-005'),
  ('o-seed-006', 'YS1013-007');

-- ---- 2.2 trade.order_ledger_log（27 条状态流转日志）----
DELETE FROM trade.order_ledger_log;
INSERT INTO trade.order_ledger_log (order_id, from_status, to_status, operator, remark, log_time)
VALUES
  -- 运输调度联动产生的两条推进日志（车次发出 → 已发运；车次关联 → 执行中）
  ('o-seed-005', '执行中', '已发运', '运输调度系统', '运输调度联动：车次 YS1013-008、YS1013-009 已发出',
   to_timestamp(1794552100 / 1000.0)),
  ('o-seed-006', '已确认', '执行中', '运输调度系统', '运输调度联动：车次 YS1013-005、YS1013-007 关联订单，开始执行',
   to_timestamp(1794551760 / 1000.0)),
  ('o-seed-009', NULL, '待确认', '系统预置', NULL, to_timestamp(1794293411942 / 1000.0)),
  ('o-seed-008', '已确认', '已终止', '系统预置', NULL, to_timestamp(1793602211942 / 1000.0)),
  ('o-seed-008', '待确认', '已确认', '系统预置', NULL, to_timestamp(1793429411942 / 1000.0)),
  ('o-seed-008', NULL, '待确认', '系统预置', NULL, to_timestamp(1793256611942 / 1000.0)),
  ('o-seed-005', '已确认', '执行中', '系统预置', NULL, to_timestamp(1792306211942 / 1000.0)),
  ('o-seed-005', '待确认', '已确认', '系统预置', NULL, to_timestamp(1792133411942 / 1000.0)),
  ('o-seed-006', '待确认', '已确认', '系统预置', NULL, to_timestamp(1792133411942 / 1000.0)),
  ('o-seed-005', NULL, '待确认', '系统预置', NULL, to_timestamp(1791960611942 / 1000.0)),
  ('o-seed-006', NULL, '待确认', '系统预置', NULL, to_timestamp(1791960611942 / 1000.0)),
  ('o-seed-007', NULL, '待确认', '系统预置', NULL, to_timestamp(1791960611942 / 1000.0)),
  ('o-seed-003', '已确认', '执行中', '系统预置', NULL, to_timestamp(1789714211942 / 1000.0)),
  ('o-seed-004', '已确认', '执行中', '系统预置', NULL, to_timestamp(1789714211942 / 1000.0)),
  ('o-seed-003', '待确认', '已确认', '系统预置', NULL, to_timestamp(1789541411942 / 1000.0)),
  ('o-seed-004', '待确认', '已确认', '系统预置', NULL, to_timestamp(1789541411942 / 1000.0)),
  ('o-seed-003', NULL, '待确认', '系统预置', NULL, to_timestamp(1789368611942 / 1000.0)),
  ('o-seed-004', NULL, '待确认', '系统预置', NULL, to_timestamp(1789368611942 / 1000.0)),
  ('o-seed-002', '执行中', '已发运', '系统预置', NULL, to_timestamp(1788591011942 / 1000.0)),
  ('o-seed-002', '已确认', '执行中', '系统预置', NULL, to_timestamp(1788418211942 / 1000.0)),
  ('o-seed-002', '待确认', '已确认', '系统预置', NULL, to_timestamp(1788245411942 / 1000.0)),
  ('o-seed-002', NULL, '待确认', '系统预置', NULL, to_timestamp(1788072611942 / 1000.0)),
  ('o-seed-001', '已发运', '已完成', '系统预置', NULL, to_timestamp(1787467811942 / 1000.0)),
  ('o-seed-001', '执行中', '已发运', '系统预置', NULL, to_timestamp(1787295011942 / 1000.0)),
  ('o-seed-001', '已确认', '执行中', '系统预置', NULL, to_timestamp(1787122211942 / 1000.0)),
  ('o-seed-001', '待确认', '已确认', '系统预置', NULL, to_timestamp(1786949411942 / 1000.0)),
  ('o-seed-001', NULL, '待确认', '系统预置', NULL, to_timestamp(1786776611942 / 1000.0));

-- ---- 3. trade.settlement（8 笔结算）----
INSERT INTO trade.settlement
  (id, settle_code, order_id, order_code, contract_id, contract_code, customer, type, amount, received, paid, settle_date, status, remark, created_at, updated_at)
VALUES
  ('s-seed-001', 'SK20260909001', 'o-seed-002', 'HZ202608300001', 'c-seed-001', 'HZ-2026-001', '武安市鑫源矿业有限公司', '应收',
   10540000, 5000000, 0, DATE '2026-12-03', '部分结算', '澳矿货款，已收预付部分', to_timestamp(1788936611943 / 1000.0), to_timestamp(1788936611943 / 1000.0)),
  ('s-seed-002', 'SK20260919001', 'o-seed-003', 'HZ202609140001', 'c-seed-001', 'HZ-2026-001', '武安市鑫源矿业有限公司', '应收',
   11160000, 0, 0, DATE '2026-12-28', '待结算', '待装船后开票结算', to_timestamp(1789800611943 / 1000.0), to_timestamp(1789800611943 / 1000.0)),
  ('s-seed-003', 'SK20260924001', 'o-seed-004', 'HZ202609140002', 'c-seed-001', 'HZ-2026-001', '武安市鑫源矿业有限公司', '应收',
   19500000, 19500000, 0, DATE '2026-12-13', '已结算', '巴西矿货款，全额收讫', to_timestamp(1790232611943 / 1000.0), to_timestamp(1790232611943 / 1000.0)),
  ('s-seed-004', 'SK20261019001', 'o-seed-005', 'HZ202610140001', 'c-seed-002', 'HZ-2026-002', '河北新金钢铁有限公司', '应收',
   8400000, 3000000, 0, DATE '2026-12-08', '部分结算', '钢坯货款，分批收款中', to_timestamp(1792392611943 / 1000.0), to_timestamp(1792392611943 / 1000.0)),
  ('s-seed-005', 'SK20260914001', 'o-seed-002', 'HZ202608300001', 'c-seed-001', 'HZ-2026-001', '武安市鑫源矿业有限公司', '应付',
   8200000, 0, 8200000, DATE '2026-12-03', '已结算', '采购与运费成本，已付清', to_timestamp(1789368611943 / 1000.0), to_timestamp(1789368611943 / 1000.0)),
  ('s-seed-006', 'SK20260924002', 'o-seed-003', 'HZ202609140001', 'c-seed-001', 'HZ-2026-001', '武安市鑫源矿业有限公司', '应付',
   9800000, 0, 2000000, DATE '2026-12-28', '部分结算', '矿款预付部分', to_timestamp(1790232611943 / 1000.0), to_timestamp(1790232611943 / 1000.0)),
  ('s-seed-007', 'SK20261103001', 'o-seed-009', 'HZ202611100001', 'c-seed-002', 'HZ-2026-002', '河北新金钢铁有限公司', '应付',
   4500000, 0, 0, DATE '2027-02-01', '待结算', '补库订单成本，待排款', to_timestamp(1793688611943 / 1000.0), to_timestamp(1793688611943 / 1000.0)),
  ('s-seed-008', 'SK20261101001', 'o-seed-008', 'HZ202610290001', 'c-seed-002', 'HZ-2026-002', '河北新金钢铁有限公司', '应收',
   4200000, 0, 0, DATE '2026-12-08', '已终止', '订单终止，结算同步关闭', to_timestamp(1793515811943 / 1000.0), to_timestamp(1793515811943 / 1000.0))
ON CONFLICT (settle_code) DO UPDATE SET
  order_id = EXCLUDED.order_id, order_code = EXCLUDED.order_code, contract_id = EXCLUDED.contract_id,
  contract_code = EXCLUDED.contract_code, customer = EXCLUDED.customer, type = EXCLUDED.type,
  amount = EXCLUDED.amount, received = EXCLUDED.received, paid = EXCLUDED.paid,
  settle_date = EXCLUDED.settle_date, status = EXCLUDED.status, remark = EXCLUDED.remark;

-- ---- 4.1 pricing.truck_price_index（31 条）----
DELETE FROM pricing.truck_price_index;
INSERT INTO pricing.truck_price_index
  (id, data_date, goods, from_place, to_place, price, remark, evidences, uploader, uploaded_at)
VALUES
  ('pr-mtji3mce-v16wl', DATE '2026-06-15', '钢铁', '黄骅港', '武安', 74.41, NULL, $j$["assets/seed/pr-mtji3mce-v16wl-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T10:52:00'),
  ('pr-mtkz3j0y-2287x', DATE '2026-07-08', '铁矿石', '黄骅港', '武安', 77.68, '万合报价', $j$["assets/seed/pr-mtkz3j0y-2287x-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T11:36:00'),
  ('pr-mtjj8ara-efc3m', DATE '2026-08-17', '铁矿石', '黄骅港', '武安', 73, '20260817普阳报价（罗伊山MB粉）', $j$["assets/seed/pr-mtjj8ara-efc3m-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T11:24:00'),
  ('pr-seed-3', DATE '2026-08-20', '铁矿石', '黄骅港', '武安', 72.48, NULL, $j$["assets/seed/pr-seed-3.png"]$j$::jsonb, '系统管理员', '2026-08-30T15:46:00'),
  ('pr-mtkz5llw-ks9c0', DATE '2026-08-20', '铁矿石', '黄骅港', '武安', 72.48, '黄骅港系统价格（澳粉-麦克粉）', $j$["assets/seed/pr-mtkz5llw-ks9c0-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T11:37:00'),
  ('pr-mtjjb92l-yjl5p', DATE '2026-08-21', '铁矿石', '黄骅港', '武安', 73, '20260821普阳报价（PMI粉）', $j$["assets/seed/pr-mtjjb92l-yjl5p-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T11:26:00'),
  ('pr-mtjjc5ei-aschq', DATE '2026-08-21', '铁矿石', '黄骅港', '武安', 73, '20260821普阳报价（罗伊山MB粉）', $j$["assets/seed/pr-mtjjc5ei-aschq-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T11:27:00'),
  ('pr-mtjjdaul-rw563', DATE '2026-08-21', '铁矿石', '黄骅港', '武安', 73, '20260821普阳报价（印度粉）', $j$["assets/seed/pr-mtjjdaul-rw563-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T11:28:00'),
  ('pr-mtkza02o-36o7l', DATE '2026-08-22', '铁矿石', '黄骅港', '武安', 73.92, '金布巴粉（黄骅港系统2026135-11）', $j$["assets/seed/pr-mtkza02o-36o7l-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T11:41:00'),
  ('pr-mtkzaxst-5ujhl', DATE '2026-08-22', '铁矿石', '黄骅港', '武安', 73.92, '金布巴粉（黄骅港系统2025190-80）', $j$["assets/seed/pr-mtkzaxst-5ujhl-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T11:41:00'),
  ('pr-mtkzc5it-6zxgq', DATE '2026-08-22', '铁矿石', '黄骅港', '武安', 73.92, '金布巴粉（黄骅港系统2026080-59）', $j$["assets/seed/pr-mtkzc5it-6zxgq-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T11:42:00'),
  ('pr-mtjjff5r-xuzxo', DATE '2026-08-24', '铁矿石', '黄骅港', '武安', 73, '20260824普阳报价（罗伊山MB粉）', $j$["assets/seed/pr-mtjjff5r-xuzxo-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T11:29:00'),
  ('pr-seed-4', DATE '2026-08-27', '铁矿石', '黄骅港', '武安', 73, NULL, $j$["assets/seed/pr-seed-4.png"]$j$::jsonb, '系统管理员', '2026-08-30T15:48:00'),
  ('pr-mtjjkhcu-te8wy', DATE '2026-08-29', '铁矿石', '黄骅港', '武安', 73, '20260829普阳报价（混合粉）', $j$["assets/seed/pr-mtjjkhcu-te8wy-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T11:33:00'),
  ('pr-mtl8lu9w-8v34s', DATE '2026-08-29', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价（南非粉）', $j$["assets/seed/pr-mtl8lu9w-8v34s-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T16:02:00'),
  ('pr-mtl8orca-1w0as', DATE '2026-08-29', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港报价（澳粉-麦克粉）', $j$["assets/seed/pr-mtl8orca-1w0as-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T16:04:00'),
  ('pr-mtl8q7i5-if9bs', DATE '2026-08-29', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价（澳粉-麦克粉）', $j$["assets/seed/pr-mtl8q7i5-if9bs-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T16:05:00'),
  ('pr-mtl6a6kf-8wn3d', DATE '2026-08-30', '铁矿石', '黄骅港', '武安', 73, '普阳报价（卡拉拉精粉）', $j$["assets/seed/pr-mtl6a6kf-8wn3d-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T14:57:00'),
  ('pr-mtjjtide-fcogt', DATE '2026-09-01', '铁矿石', '黄骅港', '武安', 73, '20260901普阳报价（铁矿粉）', $j$["assets/seed/pr-mtjjtide-fcogt-1.png"]$j$::jsonb, '系统管理员', '2026-09-02T11:40:00'),
  ('pr-mtl8s774-qx2r1', DATE '2026-09-02', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港报价（南非粉）', $j$["assets/seed/pr-mtl8s774-qx2r1-1.png"]$j$::jsonb, '系统管理员', '2026-09-03T16:07:00'),
  ('pr-mtsc9ezt-0y4v4', DATE '2026-09-06', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价', $j$["assets/seed/pr-mtsc9ezt-0y4v4-1.png"]$j$::jsonb, '系统管理员', '2026-09-08T15:19:00'),
  ('pr-mtsceh1v-93sv1', DATE '2026-09-06', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-澳粉（麦克粉）', $j$["assets/seed/pr-mtsceh1v-93sv1-1.png"]$j$::jsonb, '系统管理员', '2026-09-08T15:23:00'),
  ('pr-mtscf2oq-6ca7z', DATE '2026-09-07', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-南非粉', $j$["assets/seed/pr-mtscf2oq-6ca7z-1.png"]$j$::jsonb, '系统管理员', '2026-09-08T15:23:00'),
  ('pr-mu0xdfp4-1hik8', DATE '2026-09-11', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-南非粉', $j$["assets/seed/pr-mu0xdfp4-1hik8-1.png"]$j$::jsonb, '系统管理员', '2026-09-14T15:32:00'),
  ('pr-mu0xdxdo-8t9j2', DATE '2026-09-13', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-澳粉', $j$["assets/seed/pr-mu0xdxdo-8t9j2-1.png"]$j$::jsonb, '系统管理员', '2026-09-14T15:32:00'),
  ('pr-mu0xeewy-0ln1b', DATE '2026-09-13', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-澳粉', $j$["assets/seed/pr-mu0xeewy-0ln1b-1.png"]$j$::jsonb, '系统管理员', '2026-09-14T15:33:00'),
  ('pr-mu0xeumx-srntv', DATE '2026-09-14', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-南非粉', $j$["assets/seed/pr-mu0xeumx-srntv-1.png"]$j$::jsonb, '系统管理员', '2026-09-14T15:33:00'),
  ('pr-muapcowh-oshca', DATE '2026-09-16', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-南非粉', $j$["assets/seed/pr-muapcowh-oshca-1.png"]$j$::jsonb, '系统管理员', '2026-09-21T11:45:00'),
  ('pr-muapdeld-kq0ji', DATE '2026-09-17', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-澳粉（麦克粉）', $j$["assets/seed/pr-muapdeld-kq0ji-1.png"]$j$::jsonb, '系统管理员', '2026-09-21T11:45:00'),
  ('pr-muapdy58-5n1b6', DATE '2026-09-17', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-南非粉', $j$["assets/seed/pr-muapdy58-5n1b6-1.png"]$j$::jsonb, '系统管理员', '2026-09-21T11:46:00'),
  ('pr-muapehxk-sf9jn', DATE '2026-09-18', '铁矿石', '黄骅港', '武安', 73.91, '黄骅港系统报价-南非粉', $j$["assets/seed/pr-muapehxk-sf9jn-1.png"]$j$::jsonb, '系统管理员', '2026-09-21T11:46:00');

-- ---- 4.2 pricing.rail_price_index（16 条）----
DELETE FROM pricing.rail_price_index;
INSERT INTO pricing.rail_price_index
  (id, data_date, goods, from_place, to_place, price, remark, evidences, uploader, uploaded_at)
VALUES
  ('rl-demo-01', DATE '2026-10-13', '铁矿石', '黄骅港站', '武安', 51.8, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-13T15:05:00'),
  ('rl-demo-02', DATE '2026-10-14', '铁矿石', '黄骅港站', '邢台南站', 45, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-14T15:12:00'),
  ('rl-demo-03', DATE '2026-10-15', '钢坯', '天津港站', '武安', 60.5, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-15T15:08:00'),
  ('rl-demo-04', DATE '2026-10-16', '铁矿石', '黄骅港站', '武安', 51.8, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-16T15:03:00'),
  ('rl-demo-05', DATE '2026-10-18', '铁矿石', '黄骅港站', '邢台南站', 45.2, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-18T15:16:00'),
  ('rl-demo-06', DATE '2026-10-20', '铁矿石', '黄骅港站', '武安', 52.1, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-20T15:09:00'),
  ('rl-demo-07', DATE '2026-10-21', '钢坯', '天津港站', '武安', 60, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-21T15:14:00'),
  ('rl-demo-08', DATE '2026-10-23', '铁矿石', '黄骅港站', '邢台南站', 45, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-23T15:07:00'),
  ('rl-demo-09', DATE '2026-10-24', '铁矿石', '黄骅港站', '武安', 52.35, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-24T15:11:00'),
  ('rl-demo-10', DATE '2026-10-25', '钢坯', '天津港站', '武安', 60.4, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-25T15:06:00'),
  ('rl-demo-11', DATE '2026-10-14', '铁矿石', '黄骅港站', '曹庄镇站', 47.6, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-14T15:10:00'),
  ('rl-demo-12', DATE '2026-10-16', '铁矿石', '黄骅港站', '曹庄镇站', 47.6, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-16T15:04:00'),
  ('rl-demo-13', DATE '2026-10-18', '铁矿石', '黄骅港站', '曹庄镇站', 47.8, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-18T15:13:00'),
  ('rl-demo-14', DATE '2026-10-20', '铁矿石', '黄骅港站', '曹庄镇站', 47.8, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-20T15:07:00'),
  ('rl-demo-15', DATE '2026-10-22', '铁矿石', '黄骅港站', '曹庄镇站', 47.95, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-22T15:12:00'),
  ('rl-demo-16', DATE '2026-10-25', '铁矿石', '黄骅港站', '曹庄镇站', 47.95, NULL, $j$[]$j$::jsonb, '系统管理员', '2026-10-25T15:09:00');
