-- ============================================================================
-- HongZe-SCMS 数据库初始化迁移 V001
-- 版本: V001  名称: init_schema
-- 设计文档: docs/数据库设计文档.md
-- 幂等性: 全部对象 IF NOT EXISTS / OR REPLACE，可重复执行
-- 说明: 覆盖 8 大业务模块(矿山1/海运2/港口3/铁路5/中转6/仓储7/车队8/钢厂9)
--       + 客户/订单/价格指数关联模块 + 调度 + 迁移台账 + 业务字典 + 只读视图
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Schema 与公共函数
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS mine;
CREATE SCHEMA IF NOT EXISTS ocean;
CREATE SCHEMA IF NOT EXISTS port;
CREATE SCHEMA IF NOT EXISTS rail;
CREATE SCHEMA IF NOT EXISTS transfer;
CREATE SCHEMA IF NOT EXISTS wh;
CREATE SCHEMA IF NOT EXISTS fleet;
CREATE SCHEMA IF NOT EXISTS steel;
CREATE SCHEMA IF NOT EXISTS customer;
CREATE SCHEMA IF NOT EXISTS contract;
CREATE SCHEMA IF NOT EXISTS trade;
CREATE SCHEMA IF NOT EXISTS pricing;
CREATE SCHEMA IF NOT EXISTS ops;

-- updated_at 自动维护函数
CREATE OR REPLACE FUNCTION meta.fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. meta: 迁移台账 + 业务字典
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta.schema_migrations (
  version      text PRIMARY KEY,
  name         text NOT NULL,
  checksum     text NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  duration_ms  integer,
  reverted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS meta.dict_entry (
  id           bigserial PRIMARY KEY,
  scope        text NOT NULL,
  code         text NOT NULL,
  label        text,
  parent_code  text,
  sort_no      integer NOT NULL DEFAULT 0,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dict_scope_code UNIQUE (scope, code)
);
CREATE INDEX IF NOT EXISTS idx_dict_scope ON meta.dict_entry (scope, sort_no);

-- ---------------------------------------------------------------------------
-- 2. mine 矿山管理（菜单 1，录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mine.mine_info (
  id                text PRIMARY KEY,
  mine_name         text NOT NULL,
  short_name        text,
  mine_type         text,
  main_products     text,
  province          text,
  city              text,
  district          text,
  address           text,
  longitude         numeric(10,6),
  latitude          numeric(10,6),
  annual_capacity   numeric(14,2),
  reserve           numeric(16,2),
  ore_grade         text,
  operator          text,
  contact_person    text,
  contact_phone     text,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  commissioned_year integer,
  remark            text,
  intro             text,
  tagline           text,
  img_url           text,
  hero_url          text,
  gallery_urls      jsonb,
  img_prompt        text,
  hero_prompt       text,
  img_credit        text,
  story             jsonb,
  sort_no           integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mine_name UNIQUE (mine_name)
);
CREATE INDEX IF NOT EXISTS idx_mine_status ON mine.mine_info (status);

CREATE TABLE IF NOT EXISTS mine.mine_product (
  id          bigserial PRIMARY KEY,
  mine_id     text NOT NULL REFERENCES mine.mine_info (id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text,
  spec        text,
  output      text,
  unit        text,
  grade       text,
  impurity    text,
  size        text,
  moisture    text,
  application text,
  description text,
  sort_no     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mine_product_mine ON mine.mine_product (mine_id);

CREATE TABLE IF NOT EXISTS mine.mine_price_ref (
  id        bigserial PRIMARY KEY,
  mine_id   text NOT NULL REFERENCES mine.mine_info (id) ON DELETE CASCADE,
  name      text,
  tag       text,
  product   text,
  value     numeric(14,2),
  unit      text,
  delta     text,
  direction text CHECK (direction IN ('up','down','flat')),
  updated   text,
  source    text,
  sort_no   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mine_price_ref_mine ON mine.mine_price_ref (mine_id);

CREATE TABLE IF NOT EXISTS mine.mine_partner (
  id          bigserial PRIMARY KEY,
  mine_id     text NOT NULL REFERENCES mine.mine_info (id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text CHECK (type IN ('steel','trader','other')),
  scale       text,
  scale_value text,
  period      text,
  status      text CHECK (status IN ('lt','spot','strategic')),
  remark      text,
  sort_no     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mine_partner_mine ON mine.mine_partner (mine_id);

-- ---------------------------------------------------------------------------
-- 3. ocean 海运管理（菜单 2，独立专用表 + 同步关联映射）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocean.ocean_voyage (
  id                text PRIMARY KEY,
  voyage_code       text NOT NULL,
  vessel_name       text NOT NULL,
  mine_id           text REFERENCES mine.mine_info (id),
  mine_name         text,
  load_port         text NOT NULL,
  load_country      text,
  discharge_port    text NOT NULL,
  discharge_country text,
  cargo_type        text NOT NULL,
  quantity          numeric(12,4) NOT NULL CHECK (quantity > 0),
  freight_rate      numeric(12,4) CHECK (freight_rate >= 0),
  freight_total     numeric(18,2),
  sail_date         date,
  eta_date          date,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','loading','sailing','arrived','done')),
  remark            text,
  created_by        text DEFAULT '系统预置',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_voyage_code UNIQUE (voyage_code)
);
CREATE INDEX IF NOT EXISTS idx_voyage_status ON ocean.ocean_voyage (status);
CREATE INDEX IF NOT EXISTS idx_voyage_mine   ON ocean.ocean_voyage (mine_id);
CREATE INDEX IF NOT EXISTS idx_voyage_sail   ON ocean.ocean_voyage (sail_date);

-- ★ 同步关联映射表：航次 ← 订单向导 / 订单台账 / 合同 / 手工
CREATE TABLE IF NOT EXISTS ocean.ocean_voyage_sync (
  id            bigserial PRIMARY KEY,
  voyage_id     text NOT NULL REFERENCES ocean.ocean_voyage (id) ON DELETE CASCADE,
  source_module text NOT NULL
                CHECK (source_module IN ('order_flow','order_ledger','contract','manual')),
  source_id     text,
  source_ref    text,
  sync_rule     text NOT NULL DEFAULT 'order_shipping_sync',
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_voyage_sync UNIQUE (voyage_id, source_module, source_id)
);
CREATE INDEX IF NOT EXISTS idx_voyage_sync_source ON ocean.ocean_voyage_sync (source_module, source_id);

CREATE TABLE IF NOT EXISTS ocean.ocean_spot (
  id          bigserial PRIMARY KEY,
  no          integer,
  port        text NOT NULL,
  variety     text NOT NULL,
  fe          numeric(6,2),
  sio2        numeric(6,2),
  al2o3       numeric(6,2),
  p           numeric(6,2),
  s           numeric(6,2),
  mn          numeric(6,2),
  moisture    numeric(6,2),
  vessel      text,
  berth       text,
  data_date   date,
  data_source text DEFAULT '中国矿产·中矿国链港口现货',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spot_port    ON ocean.ocean_spot (port);
CREATE INDEX IF NOT EXISTS idx_spot_variety ON ocean.ocean_spot (variety);

CREATE TABLE IF NOT EXISTS ocean.ocean_coa (
  id             text PRIMARY KEY,
  certificate_no text NOT NULL,
  shipment_no    text,
  vessel         text,
  mine           text,
  port           text,
  issued_date    date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_coa_cert UNIQUE (certificate_no)
);
CREATE INDEX IF NOT EXISTS idx_coa_vessel ON ocean.ocean_coa (vessel);

CREATE TABLE IF NOT EXISTS ocean.ocean_coa_item (
  id         bigserial PRIMARY KEY,
  coa_id     text NOT NULL REFERENCES ocean.ocean_coa (id) ON DELETE CASCADE,
  item_name  text NOT NULL,
  item_value text,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coa_item_coa ON ocean.ocean_coa_item (coa_id);

-- ---------------------------------------------------------------------------
-- 4. port 港口管理（菜单 3，录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS port.port_info (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  subtitle   text,
  photo      text,
  intro      text,
  metrics    jsonb,
  basic_info jsonb,
  capacity   jsonb,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_port_name ON port.port_info (name);

CREATE TABLE IF NOT EXISTS port.port_zone (
  id          bigserial PRIMARY KEY,
  port_id     text NOT NULL REFERENCES port.port_info (id) ON DELETE CASCADE,
  name        text NOT NULL,
  location    text,
  positioning text,
  facilities  jsonb,
  sort_no     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_port_zone_port ON port.port_zone (port_id);

CREATE TABLE IF NOT EXISTS port.port_channel (
  id         bigserial PRIMARY KEY,
  port_id    text NOT NULL REFERENCES port.port_info (id) ON DELETE CASCADE,
  channel    text NOT NULL,
  route      text,
  via        text,
  cost       text,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_port_channel_port ON port.port_channel (port_id);

-- ---------------------------------------------------------------------------
-- 5. rail 铁路供应商管理（菜单 5，录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rail.rail_supplier (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  short_name text,
  site       text,
  facts      jsonb,
  intro      jsonb,
  fees       jsonb,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rail_name ON rail.rail_supplier (name);

CREATE TABLE IF NOT EXISTS rail.rail_contact (
  id          bigserial PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES rail.rail_supplier (id) ON DELETE CASCADE,
  name        text,
  role        text,
  tel         text,
  sort_no     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rail_contact_supplier ON rail.rail_contact (supplier_id);

-- ---------------------------------------------------------------------------
-- 6. transfer 中转站点管理（菜单 6，录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transfer.transfer_station (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  subtitle      text,
  photo         text,
  intro         text,
  metrics       jsonb,
  basic_info    jsonb,
  station_intro text,
  scale         text,
  sort_no       integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_station_name ON transfer.transfer_station (name);

CREATE TABLE IF NOT EXISTS transfer.transfer_yard (
  id         bigserial PRIMARY KEY,
  station_id text NOT NULL REFERENCES transfer.transfer_station (id) ON DELETE CASCADE,
  name       text NOT NULL,
  area       text,
  capacity   text,
  location   text,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_yard_station ON transfer.transfer_yard (station_id);

-- ---------------------------------------------------------------------------
-- 7. wh 仓储管理（菜单 7，录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wh.wh_supplier (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  type       text,
  contact    text,
  phone      text,
  address    text,
  throughput text,
  storage    text,
  area       text,
  intro      text,
  facilities jsonb,
  remark     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_supplier_name ON wh.wh_supplier (name);

CREATE TABLE IF NOT EXISTS wh.wh_stack (
  id          bigserial PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES wh.wh_supplier (id) ON DELETE CASCADE,
  name        text NOT NULL,
  ore         text,
  tonnage     numeric(14,3),
  note        text,
  sort_no     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_stack_supplier ON wh.wh_stack (supplier_id);

CREATE TABLE IF NOT EXISTS wh.wh_io_record (
  id          bigserial PRIMARY KEY,
  supplier_id text REFERENCES wh.wh_supplier (id),
  io_date     date NOT NULL,
  io_type     text NOT NULL CHECK (io_type IN ('in','out')),
  ore         text NOT NULL,
  tons        numeric(14,3) NOT NULL CHECK (tons > 0),
  order_ref   text,
  steel_name  text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_io_type     ON wh.wh_io_record (io_type);
CREATE INDEX IF NOT EXISTS idx_wh_io_date     ON wh.wh_io_record (io_date);
CREATE INDEX IF NOT EXISTS idx_wh_io_supplier ON wh.wh_io_record (supplier_id);

CREATE TABLE IF NOT EXISTS wh.wh_customs_record (
  id          bigserial PRIMARY KEY,
  supplier_id text REFERENCES wh.wh_supplier (id),
  ore         text NOT NULL,
  tons        numeric(14,3) NOT NULL,
  customs_date date,
  status      text NOT NULL DEFAULT 'stock'
              CHECK (status IN ('stock','declared','exported')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_customs_status   ON wh.wh_customs_record (status);
CREATE INDEX IF NOT EXISTS idx_wh_customs_supplier ON wh.wh_customs_record (supplier_id);

CREATE TABLE IF NOT EXISTS wh.wh_ore_catalog (
  id       bigserial PRIMARY KEY,
  ore_name text NOT NULL,
  sort_no  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wh_ore_name UNIQUE (ore_name)
);

-- ---------------------------------------------------------------------------
-- 8. fleet 汽运车队（菜单 8，录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.fleet_info (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  type          text CHECK (type IN ('自营','合作','外协')),
  contact       text,
  phone         text,
  address       text,
  capacity      text,
  fleet_size    text,
  min_guarantee text,
  max_capacity  text,
  remark        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_name ON fleet.fleet_info (name);

-- ---------------------------------------------------------------------------
-- 9. steel 钢厂管理（菜单 9，录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS steel.steel_mill (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  type        text CHECK (type IN ('长期合作','稳定合作','潜在合作')),
  contact     text,
  phone       text,
  address     text,
  capacity    text,
  ore_demand  text,
  nature      text,
  founded     text,
  reg_time    text,
  reg_capital text,
  reg_address text,
  products    text,
  intro       text,
  remark      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_steel_name UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS idx_steel_type ON steel.steel_mill (type);

-- ---------------------------------------------------------------------------
-- 10. customer 客户管理（录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer.customer (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  name_key       text,
  customer_type  text NOT NULL
                 CHECK (customer_type IN ('集采贸易商','现货贸易商','下游客户')),
  contact        text,
  phone          text,
  credit_code    text,
  source         text NOT NULL DEFAULT 'operator'
                 CHECK (source IN ('operator','self','sync')),
  status         text NOT NULL DEFAULT '待审核'
                 CHECK (status IN ('待审核','正常','停用','已驳回')),
  credentials    jsonb,
  reject_reason  text,
  history        jsonb,
  source_refs    jsonb,
  migrated_batch text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_status ON customer.customer (status);
CREATE INDEX IF NOT EXISTS idx_customer_type   ON customer.customer (customer_type);
CREATE INDEX IF NOT EXISTS idx_customer_name   ON customer.customer (name);

CREATE TABLE IF NOT EXISTS customer.customer_unified (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  category   text NOT NULL,
  source_key text,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_unified_name_cat UNIQUE (name, category)
);
CREATE INDEX IF NOT EXISTS idx_unified_category ON customer.customer_unified (category);

-- ---------------------------------------------------------------------------
-- 11. contract 合同管理（录入编辑类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract.contract (
  id         text PRIMARY KEY,
  code       text NOT NULL,
  name       text NOT NULL,
  type       text NOT NULL
             CHECK (type IN ('采购合同','销售合同','运输合同','服务合同')),
  party_a    text NOT NULL,
  party_b    text NOT NULL,
  party_c    text,
  amount     numeric(18,2) NOT NULL CHECK (amount >= 0),
  received   numeric(18,2) DEFAULT 0,
  paid       numeric(18,2) DEFAULT 0,
  quantity   numeric(14,3),
  executed   numeric(14,3) DEFAULT 0,
  sign_date  date,
  end_date   date,
  status     text NOT NULL CHECK (status IN ('履行中','已完成','已终止')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contract_code UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS idx_contract_status  ON contract.contract (status);
CREATE INDEX IF NOT EXISTS idx_contract_type    ON contract.contract (type);
CREATE INDEX IF NOT EXISTS idx_contract_party_b ON contract.contract (party_b);

CREATE TABLE IF NOT EXISTS contract.contract_template (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  type       text,
  content    jsonb,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 12. ops 运输调度（录入编辑类；先于 trade 创建供 ledger_trip 外键）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.trip (
  id          text PRIMARY KEY,
  mode        text NOT NULL CHECK (mode IN ('rail','inter','road','custom')),
  from_station text NOT NULL,
  to_station  text NOT NULL,
  cargo       text,
  tons        numeric(14,3),
  node_index  integer NOT NULL DEFAULT 0 CHECK (node_index >= 0),
  depart_time text,
  order_ref   text,
  actual_tons numeric(14,3),
  loaded_tons numeric(14,3),
  seq         integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_order ON ops.trip (order_ref);
CREATE INDEX IF NOT EXISTS idx_trip_mode  ON ops.trip (mode);

CREATE TABLE IF NOT EXISTS ops.trip_log (
  id        bigserial PRIMARY KEY,
  trip_id   text REFERENCES ops.trip (id) ON DELETE CASCADE,
  action    text,
  payload   jsonb,
  log_time  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_log_trip ON ops.trip_log (trip_id);

-- ---------------------------------------------------------------------------
-- 13. trade 订单管理 + 业务管理（录入编辑类）
-- ---------------------------------------------------------------------------
-- 13.1 流程订单主表（9 态状态机）
CREATE TABLE IF NOT EXISTS trade.flow_order (
  id          text PRIMARY KEY,
  order_code  text NOT NULL,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','port','capacity','plan','pending_confirm',
                                'confirmed','shipping','shipped','completed')),
  trader      text,
  trader_contact      text,
  trader_contact_info text,
  cargo_name  text,
  cargo_total numeric(14,3),
  cargo_price numeric(14,2),
  cargo_quality text,
  mine_id     text REFERENCES mine.mine_info (id),
  mine_name   text,
  vessel      text,
  loading_start date,
  departure   date,
  dest_port   text,
  draft_mark  text,
  destination jsonb,
  customers   jsonb,
  vessel_info jsonb,
  smart_plan  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_flow_order_code UNIQUE (order_code)
);
CREATE INDEX IF NOT EXISTS idx_flow_order_status ON trade.flow_order (status);
CREATE INDEX IF NOT EXISTS idx_flow_order_mine   ON trade.flow_order (mine_id);

CREATE TABLE IF NOT EXISTS trade.flow_order_port (
  id          text PRIMARY KEY,
  order_id    text NOT NULL REFERENCES trade.flow_order (id) ON DELETE CASCADE,
  crowding    text,
  efficiency  text,
  berth_info  text,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_flow_port_order UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS trade.flow_order_capacity (
  id           text PRIMARY KEY,
  order_id     text NOT NULL REFERENCES trade.flow_order (id) ON DELETE CASCADE,
  mode         text CHECK (mode IN ('road','rail','inter')),
  channel_name text,
  daily_tons   numeric(14,3),
  tons_per_train numeric(12,3),
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_capacity_order ON trade.flow_order_capacity (order_id);

CREATE TABLE IF NOT EXISTS trade.flow_order_plan (
  id         text PRIMARY KEY,
  order_id   text NOT NULL REFERENCES trade.flow_order (id) ON DELETE CASCADE,
  plan_name  text,
  mode       text,
  total_tons numeric(14,3),
  payload    jsonb,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_plan_order ON trade.flow_order_plan (order_id);

CREATE TABLE IF NOT EXISTS trade.flow_order_channel_detail (
  id            text PRIMARY KEY,
  plan_id       text NOT NULL REFERENCES trade.flow_order_plan (id) ON DELETE CASCADE,
  station       text,
  yard          text,
  transfer_tons numeric(14,3),
  payload       jsonb,
  sort_no       integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_channel_plan ON trade.flow_order_channel_detail (plan_id);

CREATE TABLE IF NOT EXISTS trade.flow_order_financial (
  id         text PRIMARY KEY,
  order_id   text NOT NULL REFERENCES trade.flow_order (id) ON DELETE CASCADE,
  amount     numeric(18,2),
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_flow_financial_order UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS trade.flow_order_shipping (
  id           text PRIMARY KEY,
  order_id     text NOT NULL REFERENCES trade.flow_order (id) ON DELETE CASCADE,
  channel_name text,
  plan_tons    numeric(14,3),
  actual_tons  numeric(14,3),
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_shipping_order ON trade.flow_order_shipping (order_id);

CREATE TABLE IF NOT EXISTS trade.flow_order_milestone (
  id         text PRIMARY KEY,
  order_id   text NOT NULL REFERENCES trade.flow_order (id) ON DELETE CASCADE,
  node_name  text NOT NULL,
  node_time  timestamptz,
  payload    jsonb,
  sort_no    integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_milestone_order ON trade.flow_order_milestone (order_id);

CREATE TABLE IF NOT EXISTS trade.flow_order_log (
  id          bigserial PRIMARY KEY,
  order_id    text NOT NULL REFERENCES trade.flow_order (id) ON DELETE CASCADE,
  from_status text,
  to_status   text,
  operator    text,
  remark      text,
  log_time    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_log_order ON trade.flow_order_log (order_id);

-- 13.2 订单台账（五态投影 + 终止）
CREATE TABLE IF NOT EXISTS trade.order_ledger (
  id            text PRIMARY KEY,
  order_code    text NOT NULL,
  flow_order_id text REFERENCES trade.flow_order (id),
  contract_id   text REFERENCES contract.contract (id),
  contract_code text,
  mine_id       text REFERENCES mine.mine_info (id),
  mine_name     text,
  voyage_id     text REFERENCES ocean.ocean_voyage (id),
  customer      text,
  cargo_name    text,
  cargo_qty     numeric(14,3),
  amount        numeric(18,2),
  sign_date     date,
  plan_end_date date,
  status        text NOT NULL
                CHECK (status IN ('待确认','已确认','执行中','已发运','已完成','已终止')),
  remark        text,
  created_by    text DEFAULT '系统预置',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ledger_code UNIQUE (order_code)
);
CREATE INDEX IF NOT EXISTS idx_ledger_status   ON trade.order_ledger (status);
CREATE INDEX IF NOT EXISTS idx_ledger_contract ON trade.order_ledger (contract_id);
CREATE INDEX IF NOT EXISTS idx_ledger_mine     ON trade.order_ledger (mine_id);
CREATE INDEX IF NOT EXISTS idx_ledger_voyage   ON trade.order_ledger (voyage_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON trade.order_ledger (customer);

CREATE TABLE IF NOT EXISTS trade.order_ledger_trip (
  id        bigserial PRIMARY KEY,
  ledger_id text NOT NULL REFERENCES trade.order_ledger (id) ON DELETE CASCADE,
  trip_id   text NOT NULL REFERENCES ops.trip (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ledger_trip UNIQUE (ledger_id, trip_id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_trip_trip ON trade.order_ledger_trip (trip_id);

CREATE TABLE IF NOT EXISTS trade.order_ledger_log (
  id          bigserial PRIMARY KEY,
  order_id    text NOT NULL REFERENCES trade.order_ledger (id) ON DELETE CASCADE,
  from_status text,
  to_status   text,
  operator    text,
  remark      text,
  log_time    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_log_order ON trade.order_ledger_log (order_id);

CREATE TABLE IF NOT EXISTS trade.settlement (
  id            text PRIMARY KEY,
  settle_code   text NOT NULL,
  order_id      text REFERENCES trade.order_ledger (id),
  order_code    text,
  contract_id   text REFERENCES contract.contract (id),
  contract_code text,
  customer      text,
  type          text NOT NULL CHECK (type IN ('应收','应付')),
  amount        numeric(18,2) NOT NULL CHECK (amount >= 0),
  received      numeric(18,2) DEFAULT 0,
  paid          numeric(18,2) DEFAULT 0,
  settle_date   date,
  status        text NOT NULL
                CHECK (status IN ('待结算','部分结算','已结算','已终止')),
  remark        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_settle_code UNIQUE (settle_code)
);
CREATE INDEX IF NOT EXISTS idx_settle_order  ON trade.settlement (order_id);
CREATE INDEX IF NOT EXISTS idx_settle_status ON trade.settlement (status);
CREATE INDEX IF NOT EXISTS idx_settle_type   ON trade.settlement (type);

-- ---------------------------------------------------------------------------
-- 14. pricing 价格指数管理
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing.truck_price_index (
  id          text PRIMARY KEY,
  data_date   date NOT NULL,
  goods       text NOT NULL,
  from_place  text NOT NULL,
  to_place    text NOT NULL,
  price       numeric(12,2) NOT NULL CHECK (price >= 0),
  remark      text,
  evidences   jsonb,
  uploader    text,
  uploaded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_truck_date  ON pricing.truck_price_index (data_date);
CREATE INDEX IF NOT EXISTS idx_truck_goods ON pricing.truck_price_index (goods);
CREATE INDEX IF NOT EXISTS idx_truck_route ON pricing.truck_price_index (from_place, to_place);

CREATE TABLE IF NOT EXISTS pricing.rail_price_index (
  id          text PRIMARY KEY,
  data_date   date NOT NULL,
  goods       text NOT NULL,
  from_place  text NOT NULL,
  to_place    text NOT NULL,
  price       numeric(12,2) NOT NULL CHECK (price >= 0),
  remark      text,
  evidences   jsonb,
  uploader    text,
  uploaded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rail_date  ON pricing.rail_price_index (data_date);
CREATE INDEX IF NOT EXISTS idx_rail_goods ON pricing.rail_price_index (goods);
CREATE INDEX IF NOT EXISTS idx_rail_route ON pricing.rail_price_index (from_place, to_place);

-- 静态展示落库（只读约定，由 seed 维护）
CREATE TABLE IF NOT EXISTS pricing.iron_ore_index (
  id          bigserial PRIMARY KEY,
  no          integer,
  port        text NOT NULL,
  variety     text NOT NULL,
  fe          numeric(6,2),
  sio2        numeric(6,2),
  al2o3       numeric(6,2),
  p           numeric(6,2),
  s           numeric(6,2),
  mn          numeric(6,2),
  moisture    numeric(6,2),
  vessel      text,
  berth       text,
  data_date   date,
  data_source text DEFAULT '中国矿产·中矿国链港口现货',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iron_port    ON pricing.iron_ore_index (port);
CREATE INDEX IF NOT EXISTS idx_iron_variety ON pricing.iron_ore_index (variety);

-- ---------------------------------------------------------------------------
-- 15. updated_at 触发器（统一为所有含 updated_at 的表挂载）
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mine.mine_info','port.port_info','rail.rail_supplier','transfer.transfer_station',
    'wh.wh_supplier','fleet.fleet_info','steel.steel_mill','customer.customer',
    'contract.contract','contract.contract_template','trade.flow_order',
    'trade.flow_order_port','trade.flow_order_financial','trade.order_ledger',
    'trade.settlement','ops.trip'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON %I.%I;',
                   split_part(t, '.', 1), split_part(t, '.', 2));
    EXECUTE format(
      'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON %I.%I
       FOR EACH ROW EXECUTE FUNCTION meta.fn_touch_updated_at();',
       split_part(t, '.', 1), split_part(t, '.', 2));
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 16. 只读视图（调用展示类模块：不建物理表，单一事实来源）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_home_kpi AS
SELECT
  (SELECT COALESCE(SUM(amount),0) FROM contract.contract WHERE status <> '已终止') AS contract_total_amount,
  (SELECT COUNT(*) FROM contract.contract)                                        AS contract_count,
  (SELECT COUNT(*) FROM mine.mine_info WHERE status = 'active')                   AS mine_active_count,
  (SELECT COUNT(*) FROM ocean.ocean_voyage WHERE status IN ('loading','sailing')) AS voyage_in_transit,
  (SELECT COUNT(*) FROM trade.order_ledger)                                       AS ledger_order_count;

CREATE OR REPLACE VIEW v_order_tracking AS
SELECT
  o.id            AS ledger_id,
  o.order_code,
  o.status        AS ledger_status,
  o.customer,
  o.cargo_name,
  o.cargo_qty,
  o.plan_end_date,
  v.voyage_code,
  v.vessel_name,
  v.status        AS voyage_status,
  v.eta_date,
  COUNT(t.id)     AS trip_count,
  COALESCE(SUM(t.actual_tons),0) AS trip_actual_tons
FROM trade.order_ledger o
LEFT JOIN ocean.ocean_voyage v        ON v.id = o.voyage_id
LEFT JOIN trade.order_ledger_trip lt  ON lt.ledger_id = o.id
LEFT JOIN ops.trip t                  ON t.id = lt.trip_id
GROUP BY o.id, v.id;

CREATE OR REPLACE VIEW v_dispatch_analysis AS
SELECT
  t.mode,
  t.cargo,
  COUNT(*)                    AS trip_count,
  COALESCE(SUM(t.tons),0)     AS plan_tons,
  COALESCE(SUM(t.actual_tons),0) AS actual_tons
FROM ops.trip t
GROUP BY t.mode, t.cargo;

CREATE OR REPLACE VIEW v_contract_dashboard AS
SELECT
  c.type,
  c.status,
  COUNT(*)                    AS contract_count,
  COALESCE(SUM(c.amount),0)   AS total_amount,
  COALESCE(SUM(c.executed),0) AS total_executed,
  CASE WHEN COALESCE(SUM(c.quantity),0) > 0
       THEN ROUND(COALESCE(SUM(c.executed),0) / SUM(c.quantity) * 100, 2)
       ELSE 0 END             AS execute_rate_pct
FROM contract.contract c
GROUP BY c.type, c.status;

CREATE OR REPLACE VIEW v_ocean_sync_view AS
SELECT
  v.id        AS voyage_id,
  v.voyage_code,
  v.vessel_name,
  v.mine_name,
  m.mine_name AS mine_master_name,
  v.load_port,
  v.discharge_port,
  v.cargo_type,
  v.quantity,
  v.status    AS voyage_status,
  s.source_module,
  s.source_ref,
  s.sync_rule,
  s.synced_at
FROM ocean.ocean_voyage v
LEFT JOIN mine.mine_info m          ON m.id = v.mine_id
LEFT JOIN ocean.ocean_voyage_sync s ON s.voyage_id = v.id;

-- ---------------------------------------------------------------------------
-- 17. 只读角色（规范预留：真实只读用户可 IN ROLE 挂载，无密码落库）
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scms_reader') THEN
    CREATE ROLE scms_reader NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA mine, ocean, port, rail, transfer, wh, fleet, steel,
                       customer, contract, trade, pricing, ops, meta TO scms_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA mine, ocean, port, rail, transfer, wh, fleet, steel,
                       customer, contract, trade, pricing, ops TO scms_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA meta TO scms_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA mine, ocean, port, rail, transfer, wh, fleet, steel,
                       customer, contract, trade, pricing, ops
  GRANT SELECT ON TABLES TO scms_reader;
