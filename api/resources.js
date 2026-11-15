// ============================================================================
// HongZe-SCMS · 通用 CRUD 资源配置注册表
// ----------------------------------------------------------------------------
// 每个资源配置描述「前端对象字段 ↔ 数据库列」的映射，由 engine.js 消费：
//   table    数据库表（含 schema）
//   pkJs     前端对象的 id 字段名（默认 'id'）
//   conflict UPSERT 冲突列（默认 pkCol='id'）
//   replace  'upsert'（保留未提交行，清 stale）| 'truncate'（全删全插，日志类）
//   order    GET 列表 ORDER BY
//   payload  true=整对象存 payload jsonb，GET 优先返回 payload（往返零失真）
//   indexField  提交时按下标注入该字段 → sort_no 列，保证顺序往返一致
//   normalize(item, i) 提交前逐项归一化（派生列 / 类型映射 / 兜底 id）
//   fkRefs   弱引用外键清单 [{js, table, col}]，PUT 前把失效引用置 NULL
//            （对应 V003 ON DELETE SET NULL 语义：主数据删除不受引用阻碍）
//   fields   [[前端字段, 数据库列, 类型], ...]
//   children 嵌套子表 [{js, table, fk, fields, seq, payload, valueField, order}]
//
// 类型:  t text  |  n numeric→String  |  nn numeric→Number  |  i integer
//        j jsonb  |  d date  |  ts timestamptz(前端毫秒)  |  dts timestamptz(前端格式化串)
//
// 各模块前端字段命名风格不一（矿山/台账/结算 snake_case，其余多为 camelCase），
// 以 gen-seeds.js 与各数据层实际字段为准，逐一核对。
// ============================================================================
'use strict';

// 客户来源：前端中文 → 数据库枚举（V001 source CHECK）
const SOURCE_ENUM = { '自主注册': 'self', '平台代注册': 'operator', '系统迁移': 'sync' };

const RESOURCES = {

  /* ============ 矿山管理（mine.js v12，snake_case） ============ */
  mines: {
    table: 'mine.mine_info', conflict: 'id', replace: 'upsert',
    // keepStale（合并写）：矿山为无删除功能的主数据（仅有停用/启用软删除），
    // PUT 只合并提交行、不清理未提交行 —— 缺行提交不会误删存量
    keepStale: true,
    order: 'sort_no NULLS LAST, created_at NULLS LAST, id',
    indexField: 'sort_no',
    fields: [
      ['id', 'id', 't'], ['mine_name', 'mine_name', 't'], ['short_name', 'short_name', 't'],
      ['mine_type', 'mine_type', 't'], ['main_products', 'main_products', 't'],
      ['province', 'province', 't'], ['city', 'city', 't'], ['district', 'district', 't'],
      ['address', 'address', 't'], ['longitude', 'longitude', 'nn'], ['latitude', 'latitude', 'nn'],
      ['annual_capacity', 'annual_capacity', 'nn'], ['reserve', 'reserve', 'nn'],
      ['ore_grade', 'ore_grade', 't'], ['operator', 'operator', 't'],
      ['contact_person', 'contact_person', 't'], ['contact_phone', 'contact_phone', 't'],
      ['status', 'status', 't'], ['commissioned_year', 'commissioned_year', 'i'],
      ['remark', 'remark', 't'], ['intro', 'intro', 't'], ['tagline', 'tagline', 't'],
      ['img_url', 'img_url', 't'], ['hero_url', 'hero_url', 't'],
      ['gallery_urls', 'gallery_urls', 'j'], ['img_prompt', 'img_prompt', 't'],
      ['hero_prompt', 'hero_prompt', 't'], ['img_credit', 'img_credit', 't'],
      ['story', 'story', 'j'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
    children: [
      { js: 'products_ext', table: 'mine.mine_product', fk: 'mine_id', seq: true, order: 'sort_no, id',
        fields: [
          ['name', 'name', 't'], ['category', 'category', 't'], ['spec', 'spec', 't'],
          ['output', 'output', 't'], ['unit', 'unit', 't'], ['grade', 'grade', 't'],
          ['impurity', 'impurity', 't'], ['size', 'size', 't'], ['moisture', 'moisture', 't'],
          ['application', 'application', 't'], ['desc', 'description', 't'],
        ] },
      { js: 'price_refs', table: 'mine.mine_price_ref', fk: 'mine_id', seq: true, order: 'sort_no, id',
        fields: [
          ['name', 'name', 't'], ['tag', 'tag', 't'], ['product', 'product', 't'],
          ['value', 'value', 'nn'], ['unit', 'unit', 't'], ['delta', 'delta', 't'],
          ['direction', 'direction', 't'], ['updated', 'updated', 't'], ['source', 'source', 't'],
        ] },
      { js: 'partners', table: 'mine.mine_partner', fk: 'mine_id', seq: true, order: 'sort_no, id',
        fields: [
          ['name', 'name', 't'], ['type', 'type', 't'], ['scale', 'scale', 't'],
          ['scale_value', 'scale_value', 't'], ['period', 'period', 't'],
          ['status', 'status', 't'], ['remark', 'remark', 't'],
        ] },
    ],
  },

  /* ============ 海运（ocean.js，voyage snake_case / spot camelCase） ============ */
  voyages: {
    table: 'ocean.ocean_voyage', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    payload: true,
    fkRefs: [{ js: 'mine_id', table: 'mine.mine_info', col: 'id' }],
    fields: [
      ['id', 'id', 't'], ['voyage_code', 'voyage_code', 't'], ['vessel_name', 'vessel_name', 't'],
      ['mine_id', 'mine_id', 't'], ['mine_name', 'mine_name', 't'],
      ['load_port', 'load_port', 't'], ['load_country', 'load_country', 't'],
      ['discharge_port', 'discharge_port', 't'], ['discharge_country', 'discharge_country', 't'],
      ['cargo_type', 'cargo_type', 't'], ['quantity', 'quantity', 'nn'],
      ['freight_rate', 'freight_rate', 'nn'], ['freight_total', 'freight_total', 'nn'],
      ['sail_date', 'sail_date', 'd'], ['eta_date', 'eta_date', 'd'],
      ['status', 'status', 't'], ['remark', 'remark', 't'], ['created_by', 'created_by', 't'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
  },
  spots: {   // PUT 由 handlers 特殊处理（含 iron_ore_index 镜像）
    table: 'ocean.ocean_spot', replace: 'truncate',
    order: 'no NULLS LAST, id',
    fields: [
      ['no', 'no', 'i'], ['port', 'port', 't'], ['variety', 'variety', 't'],
      ['fe', 'fe', 'nn'], ['sio2', 'sio2', 'nn'], ['al2o3', 'al2o3', 'nn'],
      ['p', 'p', 'nn'], ['s', 's', 'nn'], ['mn', 'mn', 'nn'], ['moisture', 'moisture', 'nn'],
      ['vessel', 'vessel', 't'], ['berth', 'berth', 't'],
      ['dataDate', 'data_date', 'd'], ['source', 'data_source', 't'],
    ],
  },
  ironOre: { // 只读镜像表（pricing.iron_ore_index），结构同 spots
    table: 'pricing.iron_ore_index', readOnly: true, replace: 'truncate',
    order: 'no NULLS LAST, id',
    fields: [
      ['no', 'no', 'i'], ['port', 'port', 't'], ['variety', 'variety', 't'],
      ['fe', 'fe', 'nn'], ['sio2', 'sio2', 'nn'], ['al2o3', 'al2o3', 'nn'],
      ['p', 'p', 'nn'], ['s', 's', 'nn'], ['mn', 'mn', 'nn'], ['moisture', 'moisture', 'nn'],
      ['vessel', 'vessel', 't'], ['berth', 'berth', 't'],
      ['dataDate', 'data_date', 'd'], ['source', 'data_source', 't'],
    ],
  },
  coas: {    // GET/PUT 由 handlers 特殊处理（payload 保真 + EAV 明细同步）
    table: 'ocean.ocean_coa', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    payload: true,
    fields: [
      ['id', 'id', 't'], ['certificate_no', 'certificate_no', 't'],
      ['shipment_no', 'shipment_no', 't'], ['vessel_name', 'vessel', 't'],
      ['mine', 'mine', 't'],
      ['port_of_loading', 'port', 't'], ['issue_date', 'issued_date', 'd'],
    ],
  },

  /* ============ 港口管理（ports.js v17，camelCase） ============ */
  ports: {
    table: 'port.port_info', conflict: 'id', replace: 'upsert',
    // keepStale（合并写）：港口为无删除功能的主数据，缺行提交不误删存量
    keepStale: true,
    order: 'sort_no NULLS LAST, created_at NULLS LAST, id',
    indexField: 'sortNo',
    fields: [
      ['id', 'id', 't'], ['name', 'name', 't'], ['subtitle', 'subtitle', 't'],
      ['photo', 'photo', 't'], ['intro', 'intro', 't'], ['metrics', 'metrics', 'j'],
      ['basicInfo', 'basic_info', 'j'], ['capacity', 'capacity', 'j'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
    children: [
      { js: 'zones', table: 'port.port_zone', fk: 'port_id', seq: true, order: 'sort_no, id',
        fields: [
          ['name', 'name', 't'], ['location', 'location', 't'],
          ['positioning', 'positioning', 't'], ['facilities', 'facilities', 'j'],
        ] },
      { js: 'channels', table: 'port.port_channel', fk: 'port_id', seq: true, order: 'sort_no, id',
        fields: [
          ['channel', 'channel', 't'], ['route', 'route', 't'],
          ['via', 'via', 't'], ['cost', 'cost', 't'],
        ] },
    ],
  },

  /* ============ 铁路（railway.js v14，camelCase） ============ */
  rails: {
    table: 'rail.rail_supplier', conflict: 'id', replace: 'upsert',
    // keepStale（合并写）：铁路供应商为无删除功能的主数据，缺行提交不误删存量
    keepStale: true,
    order: 'sort_no NULLS LAST, created_at NULLS LAST, id',
    indexField: 'sortNo',
    fields: [
      ['id', 'id', 't'], ['name', 'name', 't'], ['shortName', 'short_name', 't'],
      ['site', 'site', 't'], ['facts', 'facts', 'j'], ['intro', 'intro', 'j'],
      ['fees', 'fees', 'j'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
    children: [
      { js: 'persons', table: 'rail.rail_contact', fk: 'supplier_id', seq: true, order: 'sort_no, id',
        fields: [['name', 'name', 't'], ['role', 'role', 't'], ['tel', 'tel', 't']] },
    ],
  },

  /* ============ 中转站（transfer.js v19，camelCase） ============ */
  stations: {
    table: 'transfer.transfer_station', conflict: 'id', replace: 'upsert',
    // keepStale（合并写）：中转站为无删除功能的主数据，缺行提交不误删存量
    keepStale: true,
    order: 'sort_no NULLS LAST, created_at NULLS LAST, id',
    indexField: 'sortNo',
    fields: [
      ['id', 'id', 't'], ['name', 'name', 't'], ['subtitle', 'subtitle', 't'],
      ['photo', 'photo', 't'], ['intro', 'intro', 't'], ['metrics', 'metrics', 'j'],
      ['basicInfo', 'basic_info', 'j'], ['stationIntro', 'station_intro', 't'],
      ['scale', 'scale', 't'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
  },

  /* ============ 仓储（warehouse/ 四页，camelCase） ============ */
  warehouses: {
    table: 'wh.wh_supplier', conflict: 'id', replace: 'upsert',
    // keepStale（合并写）：仓储供应商为无删除功能的主数据，缺行提交不误删存量
    keepStale: true,
    order: 'created_at NULLS LAST, id',
    fields: [
      ['id', 'id', 't'], ['name', 'name', 't'], ['type', 'type', 't'],
      ['contact', 'contact', 't'], ['phone', 'phone', 't'], ['address', 'address', 't'],
      ['throughput', 'throughput', 't'], ['storage', 'storage', 't'], ['area', 'area', 't'],
      ['intro', 'intro', 't'], ['facilities', 'facilities', 'j'], ['remark', 'remark', 't'],
      ['createdAt', 'created_at', 'ts'],
    ],
    children: [
      { js: 'stacks', table: 'wh.wh_stack', fk: 'supplier_id', seq: true, order: 'sort_no, id',
        payload: true,   // tonnage '2.5万吨' 显示字符串保真
        fields: [['name', 'name', 't'], ['ore', 'ore', 't'], ['note', 'note', 't']] },
    ],
  },
  oreCatalog: {   // GET/PUT 由 handlers 特殊处理（字符串数组 ↔ 行）
    table: 'wh.wh_ore_catalog', readOnly: true, replace: 'truncate',
    order: 'sort_no, ore_name',
    fields: [['oreName', 'ore_name', 't'], ['sortNo', 'sort_no', 'i']],
  },
  ioRecords: {    // 入库/出库流水（io.js；id 列 serial 自增，前端不持有）
    table: 'wh.wh_io_record', replace: 'truncate',
    order: 'created_at NULLS LAST, id',
    fkRefs: [{ js: 'supId', table: 'wh.wh_supplier', col: 'id' }],
    fields: [
      ['supId', 'supplier_id', 't'], ['type', 'io_type', 't'], ['date', 'io_date', 'd'],
      ['ore', 'ore', 't'], ['tons', 'tons', 'nn'], ['order', 'order_ref', 't'],
      ['steel', 'steel_name', 't'], ['note', 'note', 't'],
      ['createdAt', 'created_at', 'ts'],
    ],
  },
  customsRecords: { // 报关记录（customs.js；status 兜底 declared，出库核销由 io 流水派生）
    table: 'wh.wh_customs_record', replace: 'truncate',
    order: 'created_at NULLS LAST, id',
    fkRefs: [{ js: 'supId', table: 'wh.wh_supplier', col: 'id' }],
    normalize(item) {
      item.status = 'declared';   // 报关登记即视为已报关（前端按「已报关累计」口径使用）
      return item;
    },
    fields: [
      ['supId', 'supplier_id', 't'], ['ore', 'ore', 't'], ['tons', 'tons', 'nn'],
      ['date', 'customs_date', 'd'], ['status', 'status', 't'], ['note', 'note', 't'],
      ['createdAt', 'created_at', 'ts'],
    ],
  },

  /* ============ 车队（fleet.js，camelCase） ============ */
  fleets: {
    table: 'fleet.fleet_info', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    fields: [
      ['id', 'id', 't'], ['name', 'name', 't'], ['type', 'type', 't'],
      ['contact', 'contact', 't'], ['phone', 'phone', 't'], ['address', 'address', 't'],
      ['capacity', 'capacity', 't'], ['fleetSize', 'fleet_size', 't'],
      ['minGuarantee', 'min_guarantee', 't'], ['maxCapacity', 'max_capacity', 't'],
      ['remark', 'remark', 't'], ['createdAt', 'created_at', 'ts'],
    ],
  },

  /* ============ 钢厂（steel.js，camelCase） ============ */
  steels: {
    table: 'steel.steel_mill', conflict: 'id', replace: 'upsert',
    // keepStale（合并写）：钢厂为无删除功能的主数据，缺行提交不误删存量
    keepStale: true,
    order: 'created_at NULLS LAST, id',
    fields: [
      ['id', 'id', 't'], ['name', 'name', 't'], ['type', 'type', 't'],
      ['contact', 'contact', 't'], ['phone', 'phone', 't'], ['address', 'address', 't'],
      ['capacity', 'capacity', 't'], ['oreDemand', 'ore_demand', 't'],
      ['nature', 'nature', 't'], ['founded', 'founded', 't'],
      ['regTime', 'reg_time', 't'], ['regCapital', 'reg_capital', 't'],
      ['regAddress', 'reg_address', 't'], ['products', 'products', 't'],
      ['intro', 'intro', 't'], ['remark', 'remark', 't'], ['createdAt', 'created_at', 'ts'],
    ],
  },

  /* ============ 客户管理（customers/data.js，snake_case，时间格式化串） ============ */
  customers: {
    table: 'customer.customer', conflict: 'id', replace: 'upsert',
    // keepStale（合并写）：客户为无删除功能的主数据，PUT 只合并提交行、
    // 不清理未提交行 —— 多页签缓存落后 / 装载异常时的缺行提交不会误删存量
    // （修复「更新后数据消失」：原 DELETE NOT IN 会删掉提交列表之外的行）
    keepStale: true,
    order: 'created_at NULLS LAST, id',
    payload: true,
    normalize(item) {
      item.source_enum = SOURCE_ENUM[item.source] || 'sync';
      return item;
    },
    fields: [
      ['id', 'id', 't'], ['name', 'name', 't'], ['name_key', 'name_key', 't'],
      ['customer_type', 'customer_type', 't'], ['contact', 'contact', 't'],
      ['phone', 'phone', 't'], ['credit_code', 'credit_code', 't'],
      ['source_enum', 'source', 't'], ['status', 'status', 't'],
      ['credentials', 'credentials', 'j'], ['reject_reason', 'reject_reason', 't'],
      ['history', 'history', 'j'], ['source_refs', 'source_refs', 'j'],
      ['created_at', 'created_at', 'dts'], ['updated_at', 'updated_at', 'dts'],
    ],
  },
  customersPending: {   // 遗留待归类清单（payload 行，batch D 一次性并入）
    table: 'customer.customer_pending_legacy', replace: 'truncate',
    order: 'id', payload: true, fields: [],
  },

  /* ============ 合同（contracts/，camelCase） ============ */
  contracts: {
    table: 'contract.contract', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    payload: true,
    fields: [
      ['id', 'id', 't'], ['code', 'code', 't'], ['name', 'name', 't'], ['type', 'type', 't'],
      ['partyA', 'party_a', 't'], ['partyB', 'party_b', 't'], ['partyC', 'party_c', 't'],
      ['amount', 'amount', 'nn'], ['received', 'received', 'nn'], ['paid', 'paid', 'nn'],
      ['quantity', 'quantity', 'nn'], ['executed', 'executed', 'nn'],
      ['signDate', 'sign_date', 'd'], ['endDate', 'end_date', 'd'], ['status', 'status', 't'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
  },
  templates: {  // GET/PUT 由 handlers 特殊处理（content=整个模板对象）
    table: 'contract.contract_template', readOnly: true, replace: 'truncate',
    order: 'sort_no, id',
    fields: [['name', 'name', 't'], ['type', 'type', 't'], ['sortNo', 'sort_no', 'i']],
  },
  contractMaterials: {  // PDF 材料附件（dataURL），一单多档：每合同 × 每类材料一行
    table: 'contract.contract_material', pkJs: 'contractId', pkCol: 'contract_id',
    conflict: ['contract_id', 'mat_type'],
    replace: 'upsert', order: 'contract_id, mat_type',
    // 表带真外键 ON DELETE CASCADE（合同删除自动清理附件），无需弱引用清洗
    fields: [
      ['contractId', 'contract_id', 't'], ['matType', 'mat_type', 't'],
      ['filename', 'filename', 't'], ['dataUrl', 'data_url', 't'],
    ],
  },

  /* ============ 运输调度（transport/trips-store.js，camelCase） ============ */
  trips: {   // GET/PUT 由 handlers 特殊处理（{seq, trips}，seq 存字典 sys/trip_seq）
    table: 'ops.trip', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    payload: true,
    fields: [
      ['id', 'id', 't'], ['mode', 'mode', 't'],
      ['from', 'from_station', 't'], ['to', 'to_station', 't'],
      ['cargo', 'cargo', 't'], ['tons', 'tons', 'nn'], ['nodeIndex', 'node_index', 'i'],
      ['time', 'depart_time', 'ts'], ['orderId', 'order_ref', 't'],
      ['actualTons', 'actual_tons', 'nn'],
    ],
  },
  tripLogs: {
    table: 'ops.trip_log', replace: 'truncate',
    order: 'log_time DESC NULLS LAST, id DESC',  // 新日志在前（前端直接取前 10 条展示）
    payload: true,
    fields: [
      ['tripId', 'trip_id', 't'], ['action', 'action', 't'], ['time', 'log_time', 'ts'],
    ],
  },
  analyticsOrders: {  // 调度数据分析·订单台账（analytics/dispatch.js；订单号 + 总委托量）
    table: 'ops.analysis_order', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_ref', 't'],
      ['qty', 'qty', 'nn'], ['createdAt', 'created_at', 'ts'],
    ],
  },

  /* ============ 订单台账（business/business-data.js，snake_case） ============ */
  ledger: {
    table: 'trade.order_ledger', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    payload: true,
    fkRefs: [
      { js: 'flow_order_id', table: 'trade.flow_order', col: 'id' },
      { js: 'contract_id', table: 'contract.contract', col: 'id' },
      { js: 'mine_id', table: 'mine.mine_info', col: 'id' },
      { js: 'voyage_id', table: 'ocean.ocean_voyage', col: 'id' },
    ],
    fields: [
      ['id', 'id', 't'], ['order_code', 'order_code', 't'],
      ['flow_order_id', 'flow_order_id', 't'],
      ['contract_id', 'contract_id', 't'], ['contract_code', 'contract_code', 't'],
      ['mine_id', 'mine_id', 't'], ['mine_name', 'mine_name', 't'],
      ['voyage_id', 'voyage_id', 't'], ['customer', 'customer', 't'],
      ['cargo_name', 'cargo_name', 't'], ['cargo_qty', 'cargo_qty', 'nn'],
      ['amount', 'amount', 'nn'], ['sign_date', 'sign_date', 'd'],
      ['plan_end_date', 'plan_end_date', 'd'], ['status', 'status', 't'],
      ['remark', 'remark', 't'], ['created_by', 'created_by', 't'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
    children: [
      { js: 'trip_ids', table: 'trade.order_ledger_trip', fk: 'ledger_id',
        valueField: 'trip_id', seq: true, order: 'sort_no, id', fields: [] },
    ],
  },
  ledgerLogs: {
    table: 'trade.order_ledger_log', replace: 'truncate',
    order: 'log_time DESC NULLS LAST, id DESC',
    payload: true,
    fkRefs: [{ js: 'order_id', table: 'trade.order_ledger', col: 'id' }],
    fields: [
      ['order_id', 'order_id', 't'], ['from_status', 'from_status', 't'],
      ['to_status', 'to_status', 't'], ['operator', 'operator', 't'],
      ['remark', 'remark', 't'], ['time', 'log_time', 'ts'],
    ],
  },
  settlements: {
    table: 'trade.settlement', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    payload: true,
    fkRefs: [
      { js: 'order_id', table: 'trade.order_ledger', col: 'id' },
      { js: 'contract_id', table: 'contract.contract', col: 'id' },
    ],
    fields: [
      ['id', 'id', 't'], ['settle_code', 'settle_code', 't'],
      ['order_id', 'order_id', 't'], ['order_code', 'order_code', 't'],
      ['contract_id', 'contract_id', 't'], ['contract_code', 'contract_code', 't'],
      ['customer', 'customer', 't'], ['type', 'type', 't'],
      ['amount', 'amount', 'nn'], ['received', 'received', 'nn'], ['paid', 'paid', 'nn'],
      ['settle_date', 'settle_date', 'd'], ['status', 'status', 't'], ['remark', 'remark', 't'],
      ['created_at', 'created_at', 'ts'], ['updated_at', 'updated_at', 'ts'],
    ],
  },

  /* ============ 贸易流程（business/flow/flow-data.js，camelCase，9 个键） ============ */
  flowOrders: {
    table: 'trade.flow_order', conflict: 'id', replace: 'upsert',
    order: 'created_at NULLS LAST, id',
    payload: true,
    fkRefs: [{ js: 'mineId', table: 'mine.mine_info', col: 'id' }],
    normalize(item) {
      if (item.orderCode == null || item.orderCode === '') item.orderCode = item.id;
      return item;
    },
    fields: [
      ['id', 'id', 't'], ['orderCode', 'order_code', 't'], ['status', 'status', 't'],
      ['trader', 'trader', 't'], ['traderContact', 'trader_contact', 't'],
      ['traderContactInfo', 'trader_contact_info', 't'],
      ['cargoName', 'cargo_name', 't'], ['cargoTotal', 'cargo_total', 'nn'],
      ['cargoPrice', 'cargo_price', 'nn'], ['cargoQuality', 'cargo_quality', 't'],
      ['mineId', 'mine_id', 't'], ['mine', 'mine_name', 't'],
      ['vessel', 'vessel', 't'], ['loadingStart', 'loading_start', 'd'],
      ['departure', 'departure', 'd'], ['destPort', 'dest_port', 't'],
      ['draftMark', 'draft_mark', 't'], ['destination', 'destination', 'j'],
      ['customers', 'customers', 'j'], ['vesselInfo', 'vessel_info', 'j'],
      ['smartPlan', 'smart_plan', 'j'],
      ['createdAt', 'created_at', 'ts'], ['updatedAt', 'updated_at', 'ts'],
    ],
  },
  flowPorts: {
    table: 'trade.flow_order_port', conflict: 'id', replace: 'upsert',
    order: 'order_id, id',
    payload: true,
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    normalize(item) { if (!item.id) item.id = 'port_' + item.orderId; return item; },
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_id', 't'], ['crowding', 'crowding', 't'],
      ['efficiency', 'efficiency', 't'], ['berthInfo', 'berth_info', 't'],
      ['updatedAt', 'updated_at', 'ts'],
    ],
  },
  flowCapacities: {
    table: 'trade.flow_order_capacity', conflict: 'id', replace: 'upsert',
    order: 'sort_no, id',
    payload: true, indexField: 'sortNo',
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    normalize(item) {
      // DB mode 枚举 road/rail/inter ← 前端 channelType（rail_* 为联运）
      const t = item.channelType;
      item.mode = t === 'road' ? 'road' : (t === 'rail_direct' ? 'rail' : 'inter');
      return item;
    },
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_id', 't'], ['mode', 'mode', 't'],
      ['channelType', 'channel_name', 't'], ['plannedQty', 'daily_tons', 'nn'],
      ['sortNo', 'sort_no', 'i'],
    ],
  },
  flowPlans: {
    table: 'trade.flow_order_plan', conflict: 'id', replace: 'upsert',
    order: 'sort_no, id',
    payload: true, indexField: 'sortNo',
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    normalize(item) { if (!item.id) item.id = 'plan_' + item.orderId; return item; },
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_id', 't'], ['sortNo', 'sort_no', 'i'],
    ],
  },
  flowChannelDetails: {
    table: 'trade.flow_order_channel_detail', conflict: 'id', replace: 'upsert',
    order: 'sort_no, id',
    payload: true, indexField: 'sortNo',
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    normalize(item) {
      if (!item.id) item.id = 'det_' + item.orderId + '_' + item.channelType;
      return item;
    },
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_id', 't'], ['sortNo', 'sort_no', 'i'],
    ],
  },
  flowFinancials: {
    table: 'trade.flow_order_financial', conflict: 'id', replace: 'upsert',
    order: 'order_id, id',
    payload: true,
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    normalize(item) { if (!item.id) item.id = 'fin_' + item.orderId; return item; },
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_id', 't'], ['totalAmount', 'amount', 'nn'],
    ],
  },
  flowShippings: {
    table: 'trade.flow_order_shipping', conflict: 'id', replace: 'upsert',
    order: 'sort_no, id',
    payload: true, indexField: 'sortNo',
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    normalize(item) {
      if (!item.id) item.id = 'shp_' + item.orderId + '_' + item.capacityId;
      return item;
    },
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_id', 't'], ['channelType', 'channel_name', 't'],
      ['plannedQty', 'plan_tons', 'nn'], ['shippedQty', 'actual_tons', 'nn'],
      ['sortNo', 'sort_no', 'i'],
    ],
  },
  flowMilestones: {
    table: 'trade.flow_order_milestone', conflict: 'id', replace: 'upsert',
    order: 'sort_no, id',
    payload: true, indexField: 'sortNo',
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    normalize(item) {
      if (!item.nodeName) item.nodeName = item.name || '节点';   // node_name NOT NULL 兜底
      return item;
    },
    fields: [
      ['id', 'id', 't'], ['orderId', 'order_id', 't'], ['nodeName', 'node_name', 't'],
      ['plannedTime', 'node_time', 'ts'], ['sortNo', 'sort_no', 'i'],
    ],
  },
  flowLogs: {
    table: 'trade.flow_order_log', replace: 'truncate',
    order: 'log_time DESC NULLS LAST, id DESC',
    payload: true,
    fkRefs: [{ js: 'orderId', table: 'trade.flow_order', col: 'id' }],
    fields: [
      ['orderId', 'order_id', 't'], ['operator', 'operator', 't'],
      ['fromStatus', 'from_status', 't'], ['toStatus', 'to_status', 't'],
      ['remark', 'remark', 't'], ['createdAt', 'log_time', 'ts'],
    ],
  },

  /* ============ 价格指数（price-index/，camelCase） ============ */
  truckPrices: {
    table: 'pricing.truck_price_index', replace: 'truncate',
    order: 'data_date DESC NULLS LAST, id DESC',
    fields: [
      ['id', 'id', 't'], ['dataDate', 'data_date', 'd'], ['goods', 'goods', 't'],
      ['from', 'from_place', 't'], ['to', 'to_place', 't'], ['price', 'price', 'nn'],
      ['remark', 'remark', 't'], ['evidences', 'evidences', 'j'],
      ['uploader', 'uploader', 't'], ['uploadedAt', 'uploaded_at', 'dts'],
    ],
  },
  railPrices: {
    table: 'pricing.rail_price_index', replace: 'truncate',
    order: 'data_date DESC NULLS LAST, id DESC',
    fields: [
      ['id', 'id', 't'], ['dataDate', 'data_date', 'd'], ['goods', 'goods', 't'],
      ['from', 'from_station', 't'], ['to', 'to_station', 't'], ['price', 'price', 'nn'],
      ['remark', 'remark', 't'], ['evidences', 'evidences', 'j'],
      ['uploader', 'uploader', 't'], ['uploadedAt', 'uploaded_at', 'dts'],
    ],
  },
};

// COA 质检证书 EAV 明细映射：前端字段 ↔ item_name（ocean_coa_item）
const COA_ITEMS = [
  ['country_of_origin', '原产地'],
  ['bl_date', '提单日期'],
  ['goods', '货物名称'],
  ['wet_tons', '湿吨'],
  ['dry_tons', '干吨'],
  ['moisture', '水分 %'],
  ['physical_63mm', '+63mm 物理 %'],
  ['fe', 'Fe %'],
  ['p', 'P %'],
  ['s', 'S %'],
  ['sio2', 'SiO2 %'],
  ['al2o3', 'Al2O3 %'],
  ['loi', '烧失量 LOI %'],
  ['remark', '备注'],
];

module.exports = { RESOURCES, COA_ITEMS };
