// ===== flow 模块共享数据层（订单管理 · 全流程业务操作）=====
// 复刻自本地演示项目 hongze_demo 的业务流程数据模型：
// 订单 → 港口信息 → 运力方案 → 运输方案 → 财务确认 → 发运/仓储 → 货物动态/时间轴。
// 数据基座：common/hz-db.js（HZDB）—— 9 张表存于后端数据库
// （flowOrders / flowPorts / flowCapacities / flowPlans / flowChannelDetails /
//   flowFinancials / flowShippings / flowMilestones / flowLogs），
// bootstrap 全量缓存 + PUT 全量替换；读为同步（缓存），写为 async（失败返回 false）。
// 跨模块联动：台账（ledger）经 HZBusinessData、海运航次（voyages）与矿山（mines）直读 HZDB。
// 种子数据由后端数据库预置，前端不再内置种子。
(function () {
  'use strict';

  /* ==================== 存储键（API 资源名） ==================== */

  const KEYS = {
    orders: 'flowOrders',                 // 订单
    ports: 'flowPorts',                   // 港口信息
    capacities: 'flowCapacities',         // 运力通道
    plans: 'flowPlans',                   // 运输方案批次
    channelDetails: 'flowChannelDetails', // 公铁联运中转详情
    financials: 'flowFinancials',         // 财务信息
    shippings: 'flowShippings',           // 通道发运信息
    milestones: 'flowMilestones',         // 货物动态节点
    logs: 'flowLogs',                     // 操作日志
  };

  /* ==================== 基础读写与 ID ==================== */

  // 同步读缓存（须在 await HZDB.ready() 之后调用；缺失/异常返回空数组）
  function read(key) {
    const v = window.HZDB ? window.HZDB.get(key) : undefined;
    return Array.isArray(v) ? v : [];
  }

  // 全量替换写（PUT /api/:res）：成功 true；失败 HZDB 已 toast、缓存不动，返回 false
  async function write(key, data) {
    if (!window.HZDB) return false;
    return window.HZDB.put(key, data);
  }

  // 通用 ID：前缀_时间戳36进制_随机串
  function genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  // 生成订单编号：HZ + yyyyMMdd + 4 位流水（按当日已有订单递增）
  function genOrderId() {
    const d = new Date();
    const ymd = d.getFullYear().toString() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    const prefix = 'HZ' + ymd;
    const maxSeq = read(KEYS.orders).reduce((max, o) => {
      if (!o.id || o.id.indexOf(prefix) !== 0) return max;
      const n = Number(o.id.slice(prefix.length));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return prefix + String(maxSeq + 1).padStart(4, '0');
  }

  /* ==================== 订单状态机 ==================== */

  // 订单状态元数据：label 中文标签 / color 主色 / bg 浅底 / phase 阶段分组
  const STATUS_META = {
    draft: { label: '录入中', color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', phase: 'create' },
    port: { label: '待港口', color: '#0071e3', bg: 'rgba(0,113,227,0.12)', phase: 'create' },
    capacity: { label: '待运力', color: '#ff9500', bg: 'rgba(255,149,0,0.12)', phase: 'create' },
    plan: { label: '待方案', color: '#af52de', bg: 'rgba(175,82,222,0.12)', phase: 'create' },
    pending_confirm: { label: '待确认', color: '#ff9500', bg: 'rgba(255,149,0,0.12)', phase: 'business' },
    confirmed: { label: '订单已确认', color: '#0071e3', bg: 'rgba(0,113,227,0.12)', phase: 'business' },
    shipping: { label: '发运中', color: '#5856d6', bg: 'rgba(88,86,214,0.12)', phase: 'business' },
    shipped: { label: '发运完成', color: '#34c759', bg: 'rgba(52,199,89,0.12)', phase: 'business' },
    completed: { label: '已完成', color: '#34c759', bg: 'rgba(52,199,89,0.12)', phase: 'final' },
  };

  // 状态列表（步骤条顺序）
  const STATUS_ORDER = ['draft', 'port', 'capacity', 'plan', 'pending_confirm', 'confirmed', 'shipping', 'shipped', 'completed'];

  // 状态流转规则：键 = 当前状态，值 = 可流转到的下一状态集合（线性单向）
  const STATUS_FLOW = {
    draft: ['port'],
    port: ['capacity'],
    capacity: ['plan'],
    plan: ['pending_confirm'],
    pending_confirm: ['confirmed'],
    confirmed: ['shipping'],
    shipping: ['shipped'],
    shipped: ['completed'],
    completed: [],
  };

  // 旧状态迁移：'done' → 'pending_confirm'
  function migrateStatus(s) {
    return s === 'done' ? 'pending_confirm' : s;
  }

  // 校验状态转换是否合法（管理员角色可跳过校验）
  function canTransition(from, to, isAdmin) {
    const f = migrateStatus(from);
    if (!f) return true;
    if (isAdmin) return true;
    const allowed = STATUS_FLOW[f] || [];
    return allowed.indexOf(to) !== -1;
  }

  /* ==================== 业务常量 ==================== */

  // 铁矿石细分品类选项
  const CARGO_CATEGORIES = ['PB粉', '麦克粉', '超特粉', '纽曼粉', '卡粉', '金布巴粉', '杨迪粉', '罗布河粉', '混合粉', '块矿', '球团'];

  // 来源矿山选项
  const MINE_OPTIONS = ['力拓', 'BHP 必和必拓', '淡水河谷', 'FMG', '其他'];

  // 矿石贸易商选项（订单客户下拉：矿石贸易商为我方付费客户）
  const TRADER_OPTIONS = ['中矿国链', '四川云贸', '厦门象屿', '五矿发展', '中钢集团', '建发集团', '物产中大', '河北物流', '浙商中拓', '厦门国贸'];

  // 铁路承运商选项
  const RAIL_CARRIERS = ['中铁快运', '国铁供应链', '国铁集团'];

  // 公路承运商选项
  const ROAD_CARRIERS = ['万合集团', '河北陆港'];

  // 公铁联运中转节点选项
  const TRANSFER_OPTIONS = ['邢台南站', '曹庄镇站'];

  // 铁路站点选项（邯郸/黄骅地区）
  const RAIL_STATION_OPTIONS = ['黄骅站', '渤海东站', '邯郸站', '武安站', '沙河站', '邢台南站', '曹庄镇站', '邢台站', '衡水站', '石家庄站'];

  // 公路站点选项（邯郸/黄骅地区）
  const ROAD_LOCATION_OPTIONS = ['黄骅港', '黄骅港20万吨码头', '武安保税物流园', '邯郸钢铁集团', '邯钢新区', '新兴铸管', '天铁集团', '普阳钢铁', '冀南钢铁', '河北普阳', '新金钢铁', '邯郸华信'];

  // 装卸设备类型选项
  const EQUIPMENT_OPTIONS = ['龙门吊', '抓斗起重机', '门座起重机', '装载机', '带式输送机', '其他'];

  // 后程公路车辆类型选项
  const VEHICLE_OPTIONS = ['13 米半挂车', '17.5 米平板车', '9.6 米厢式车', '自卸车', '集装箱拖车', '其他'];

  // 凭证类型选项
  const VOUCHER_TYPES = ['发票', '收据', '请车计划', '运单', '装箱单', '其他'];

  // 港口拥堵情况选项
  const CONGESTION_OPTIONS = [
    { value: 'normal', label: '正常', color: '#34c759' },
    { value: 'mild', label: '轻度拥堵', color: '#ff9500' },
    { value: 'severe', label: '严重拥堵', color: '#ff3b30' },
  ];

  // 通道类型元数据：label 全称 / short 简称 / transfer 固定中转站（旧数据兼容）/ color 主色
  const CHANNEL_META = {
    rail_direct: { label: '铁路直达', short: '铁路直达', color: '#0071e3' },
    rail_caozhuang: { label: '公铁联运（曹庄镇站中转）', short: '公铁联运·曹庄镇', transfer: '曹庄镇站', color: '#af52de' },
    rail_xingtai: { label: '公铁联运（邢台南站中转）', short: '公铁联运·邢台南', transfer: '邢台南站', color: '#ff9500' },
    rail_transit: { label: '公铁联运', short: '公铁联运', color: '#af52de' },
    road: { label: '公路直达', short: '公路直达', color: '#34c759' },
  };

  // 通道大类元数据（按运输方式聚合展示）
  const CHANNEL_GROUP_META = {
    rail_direct: { label: '铁路直达', color: '#0071e3' },
    rail_transit: { label: '公铁联运', color: '#af52de' },
    road: { label: '公路直达', color: '#34c759' },
  };

  // 通道类型 → 通道大类
  function toChannelGroup(t) {
    if (t === 'rail_direct') return 'rail_direct';
    if (t === 'road') return 'road';
    return 'rail_transit'; // rail_caozhuang / rail_xingtai / rail_transit
  }

  // 是否公铁联运通道（需要中转详情）
  function isTransitChannel(t) {
    return t === 'rail_caozhuang' || t === 'rail_xingtai' || t === 'rail_transit';
  }

  // 通道显示名称（rail_transit 带 transfer 后缀以区分中转站）
  function channelLabel(c) {
    const meta = CHANNEL_META[c.channelType] || { label: c.channelType };
    if (c.channelType === 'rail_transit' && c.transfer) {
      return meta.label + '（' + c.transfer + '）';
    }
    return meta.label;
  }

  /* ==================== 角色与凭证元数据 ==================== */

  // 操作角色元数据
  const ROLE_META = {
    sales: { label: '业务员', color: '#0071e3' },
    port: { label: '港口专员', color: '#ff9500' },
    capacity: { label: '运力专员', color: '#af52de' },
    finance: { label: '财务人员', color: '#34c759' },
    transport: { label: '运输人员', color: '#5856d6' },
    admin: { label: '管理员', color: '#8e8e93' },
  };

  // 收款状态元数据
  const PAYMENT_META = {
    unpaid: { label: '未收款', color: '#ff3b30', bg: 'rgba(255,59,48,0.12)' },
    partial: { label: '部分收款', color: '#ff9500', bg: 'rgba(255,149,0,0.12)' },
    paid: { label: '已全额收款', color: '#34c759', bg: 'rgba(52,199,89,0.12)' },
  };

  // 发票状态元数据
  const INVOICE_META = {
    none: { label: '未开具', color: '#8e8e93', bg: 'rgba(142,142,147,0.12)' },
    issued: { label: '已开具', color: '#0071e3', bg: 'rgba(0,113,227,0.12)' },
    delivered: { label: '已交付', color: '#34c759', bg: 'rgba(52,199,89,0.12)' },
  };

  // 发运状态元数据（单条运输通道）
  const SHIPPING_META = {
    not_started: { label: '未开始', color: '#8e8e93', bg: 'rgba(142,142,147,0.12)' },
    shipping: { label: '发运中', color: '#5856d6', bg: 'rgba(88,86,214,0.12)' },
    completed: { label: '已完成', color: '#34c759', bg: 'rgba(52,199,89,0.12)' },
  };

  /* ==================== 格式化工具 ==================== */

  // 数量格式化：千分位最多两位小数，空值显示 —
  function fmtNum(n, unit) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    const s = Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    return unit ? s + ' ' + unit : s;
  }

  // 金额格式化：¥ 前缀千分位
  function fmtMoney(n) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return '¥' + Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  // 日期时间格式化：yyyy-MM-dd HH:mm
  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // 日期格式化：yyyy-MM-dd
  function fmtDateShort(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // datetime-local 输入框值：yyyy-MM-ddTHH:mm
  function toLocalInput(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // XSS 防护：动态文案统一转义
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 终端客户名称展示（以"、"连接）
  function customersDisplay(customers) {
    if (!customers || !customers.length) return '';
    return customers.map(c => c.name).filter(Boolean).join('、');
  }

  // 终端客户销售数量合计
  function customersTotalQty(customers) {
    if (!customers || !customers.length) return 0;
    return customers.reduce((s, c) => s + (Number(c.qty) || 0), 0);
  }

  /* ==================== 订单 CRUD ==================== */

  // 订单列表（createdAt 降序，旧数据迁移状态与客户结构）
  function listOrders() {
    return read(KEYS.orders).map(migrateOrder).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // 旧数据迁移（纯函数，不改动缓存对象）：steelMill/saleQty → customers 数组，'done' 状态迁移
  function migrateOrder(o) {
    if (Array.isArray(o.customers) && o.status !== 'done') return o;
    const c = Object.assign({}, o);
    if (!Array.isArray(c.customers)) {
      const names = String(c.steelMill || '').split('\n').map(s => s.trim()).filter(Boolean);
      const totalQty = Number(c.saleQty) || 0;
      c.customers = names.map((name, i) => ({
        id: 'cust_legacy_' + i,
        name: name,
        qty: i === 0 ? totalQty : 0,
      }));
      delete c.steelMill;
      delete c.saleQty;
    }
    c.status = migrateStatus(c.status);
    return c;
  }

  function getOrder(id) {
    const found = read(KEYS.orders);
    for (let i = 0; i < found.length; i++) {
      if (found[i].id === id) return migrateOrder(Object.assign({}, found[i]));
    }
    return undefined;
  }

  // 新建订单（含创建日志，返回完整订单对象）
  async function createOrder(order, operator, role) {
    const now = new Date().toISOString();
    const full = Object.assign({
      trader: '', traderContact: '', traderContactInfo: '',
      cargoName: '', cargoTotal: 0, cargoPrice: 0, cargoQuality: '', mine: '',
      vessel: '', loadingStart: '', departure: '', destPort: '', draftMark: 0,
      customers: [],
      createdAt: now, updatedAt: now, status: 'draft',
    }, order);
    await upsertOrder(full);
    await addOperationLog(full.id, operator || '系统', role || 'sales', '创建订单', { remark: '订单创建，状态：录入中' });
    return full;
  }

  // 新增/更新订单（复制写回，put 失败时缓存保持原样）；成功后联动台账与海运
  async function upsertOrder(order) {
    const list = read(KEYS.orders);
    const exists = list.some(o => o.id === order.id);
    const next = exists ? list.map(o => (o.id === order.id ? order : o)) : list.concat([order]);
    const ok = await write(KEYS.orders, next);
    if (!ok) return false;
    // 订单台账联动：流程订单达同步点（待确认及之后）自动同步进台账（FR-03）
    if (window.HZBusinessData && typeof window.HZBusinessData.syncFlowOrder === 'function') {
      try { await window.HZBusinessData.syncFlowOrder(order); } catch (e) { console.warn('订单台账联动失败：', e); /* 同步失败不阻断流程 */ }
    }
    // 海运管理联动：航运信息（船舶/货量）录入后自动新增同步生成航次（R1）
    try { await syncVoyageToOcean(order); } catch (e) { console.warn('海运航次联动失败：', e); /* 同步失败不阻断流程 */ }
    return true;
  }

  // 保存订单（自动刷新更新时间）
  async function saveOrder(order) {
    order.updatedAt = new Date().toISOString();
    return upsertOrder(order);
  }

  // 删除订单：级联清空关联的 8 张关联表
  // 九表快照 → 逐表过滤删除 → 失败即停并 best-effort 恢复已删除表
  async function deleteOrder(id) {
    const TABLES = ['orders', 'ports', 'capacities', 'plans', 'channelDetails', 'financials', 'shippings', 'milestones', 'logs'];
    const FILTERS = {
      orders: o => o.id !== id,
      ports: p => p.orderId !== id,
      capacities: c => c.orderId !== id,
      plans: p => p.orderId !== id,
      channelDetails: d => d.orderId !== id,
      financials: f => f.orderId !== id,
      shippings: s => s.orderId !== id,
      milestones: m => m.orderId !== id,
      logs: l => l.orderId !== id,
    };
    const snaps = {};
    TABLES.forEach(name => { snaps[name] = read(KEYS[name]); });

    const done = [];
    for (let i = 0; i < TABLES.length; i++) {
      const name = TABLES[i];
      const kept = snaps[name].filter(FILTERS[name]);
      const ok = await write(KEYS[name], kept);
      if (!ok) {
        // 写失败：恢复已删除的表（best-effort），返回 false 由页面保持现场
        for (let j = done.length - 1; j >= 0; j--) {
          try { await write(KEYS[done[j]], snaps[done[j]]); } catch (e) { console.warn('回滚失败：', done[j], e); }
        }
        return false;
      }
      done.push(name);
    }

    // 订单台账联动：已同步进台账的流程订单一并删除（FR-03）
    if (window.HZBusinessData && typeof window.HZBusinessData.removeFlowOrder === 'function') {
      try { await window.HZBusinessData.removeFlowOrder(id); } catch (e) { console.warn('台账删除联动失败：', e); /* 联动失败不阻断删除 */ }
    }
    // 海运管理联动：清理由本订单同步生成的航次（R1）
    try { await removeVoyageByFlowRef(id); } catch (e) { console.warn('航次删除联动失败：', e); /* 联动失败不阻断删除 */ }
    return true;
  }

  // 仅更新订单状态（复制写回）
  async function updateOrderStatus(id, status) {
    const list = read(KEYS.orders);
    const idx = list.findIndex(o => o.id === id);
    if (idx < 0) return false;
    const rec = Object.assign({}, list[idx], { status: status, updatedAt: new Date().toISOString() });
    const next = list.slice();
    next[idx] = rec;
    return write(KEYS.orders, next);
  }

  // 执行状态流转：校验 STATUS_FLOW 规则，更新状态并写日志；非法流转或写失败返回 false
  async function transitionStatus(orderId, to, operator, role, remark) {
    const order = getOrder(orderId);
    if (!order) return false;
    const from = migrateStatus(order.status);
    if (!canTransition(from, to, role === 'admin')) return false;
    const labelOf = s => (s ? (STATUS_META[s] ? STATUS_META[s].label : s) : '初始');
    const ok = await updateOrderStatus(orderId, to);
    if (!ok) return false;
    await addOperationLog(orderId, operator, role, '状态变更：' + labelOf(from) + ' → ' + labelOf(to), {
      fromStatus: from, toStatus: to, remark: remark || '',
    });
    return true;
  }

  /* ==================== 海运管理联动（R1：航运信息新增同步） ==================== */

  // 读取海运航次（DB 资源 voyages，海运管理模块权威数据；本层只做新增/更新同步，不改海运侧字段）
  function readOceanVoyages() {
    const v = window.HZDB ? window.HZDB.get('voyages') : undefined;
    return Array.isArray(v) ? v : [];
  }

  // 航运信息新增同步：订单录入船舶 + 货量后，自动在海运管理生成/更新对应航次（幂等，flow_ref 关联流程订单）
  // 单位经 HZUnits 转换（业务侧吨 → 海运侧万吨），非法/零值不落库；仅覆盖业务侧字段，
  // 海运侧 status / freight_rate / load_port / remark 等由海运模块维护
  async function syncVoyageToOcean(order) {
    const U = window.HZUnits;
    if (!order || !order.id || !U || !window.HZDB) return false;
    const vessel = String(order.vessel || '').trim();
    const wanTon = U.normalizeTo(order.cargoTotal, 'ton', 'wanTon'); // 吨 → 万吨，非法/0 返回 null
    if (!vessel || wanTon == null) return false; // 航运信息（船名/货量）未录入完整：不同步

    const voyages = readOceanVoyages();
    const now = Date.now();
    let idx = -1;
    for (let i = 0; i < voyages.length; i++) {
      if (voyages[i].flow_ref === order.id) { idx = i; break; }
    }
    // 既有航次复制后改字段，避免污染 HZDB 缓存中的原数组
    let rec = idx >= 0 ? Object.assign({}, voyages[idx]) : null;

    // 矿山 id 回填：按简称/全称匹配矿山主数据（DB 资源 mines，矿山模块权威数据）
    let mineId = '';
    if (order.mine) {
      const mines = readOceanMines();
      for (let i = 0; i < mines.length; i++) {
        if ((mines[i].short_name || mines[i].mine_name) === order.mine) { mineId = mines[i].id || ''; break; }
      }
    }

    if (!rec) {
      // 新增航次：航次号 S- 三位流水（与海运模块 genCode 同规则扫描最大流水 + 1）
      let maxSeq = 0;
      voyages.forEach(v => {
        const n = /^S-(\d+)$/.exec(v.voyage_code || '');
        if (n) maxSeq = Math.max(maxSeq, Number(n[1]));
      });
      rec = {
        id: 'v' + now.toString(36) + Math.random().toString(36).slice(2, 7),
        voyage_code: 'S-' + String(maxSeq + 1).padStart(3, '0'),
        load_port: '', load_country: '', discharge_country: '',
        freight_rate: 0, eta_date: '',
        status: 'pending',
        remark: '来自业务管理 · 订单 ' + order.id,
        flow_ref: order.id,
        created_at: now,
        created_by: '业务管理',
      };
    }

    // 仅覆盖业务侧字段，海运侧字段（status/freight_rate/load_port/remark）保留
    rec.vessel_name = vessel;
    rec.discharge_port = order.destPort || '';
    rec.cargo_type = order.cargoName || '';
    rec.quantity = wanTon;
    rec.mine_name = order.mine || '';
    if (mineId) rec.mine_id = mineId;
    rec.sail_date = order.departure ? String(order.departure).slice(0, 10) : '';
    rec.freight_total = Math.round(wanTon * 10000 * (Number(rec.freight_rate) || 0));
    rec.updated_at = now;
    // 船舶静态信息（订单管理 F5④）：随订单同步至航次记录（vessel_info 9 项一致，AC-O09）
    if (order.vesselInfo && typeof order.vesselInfo === 'object') {
      rec.vessel_info = Object.assign({}, order.vesselInfo);
    }

    // 复制写回（map/concat 产新数组，put 失败时缓存保持原样）
    const next = idx >= 0 ? voyages.map((v, i) => (i === idx ? rec : v)) : voyages.concat([rec]);
    return window.HZDB.put('voyages', next);
  }

  // 读取矿山主数据（DB 资源 mines，矿山模块权威数据）
  function readOceanMines() {
    const m = window.HZDB ? window.HZDB.get('mines') : undefined;
    return Array.isArray(m) ? m : [];
  }

  // 清理由指定流程订单同步生成的航次（流程订单删除时级联，仅删 flow_ref 命中的记录）
  async function removeVoyageByFlowRef(flowRef) {
    if (!flowRef || !window.HZDB) return false;
    const voyages = readOceanVoyages();
    const kept = voyages.filter(v => v.flow_ref !== flowRef);
    if (kept.length === voyages.length) return false;
    return window.HZDB.put('voyages', kept);
  }

  /* ==================== 港口信息 ==================== */

  function getPort(orderId) {
    const list = read(KEYS.ports);
    for (let i = 0; i < list.length; i++) {
      if (list[i].orderId === orderId) return Object.assign({}, list[i]);
    }
    return undefined;
  }

  async function upsertPort(port) {
    const list = read(KEYS.ports);
    const exists = list.some(p => p.orderId === port.orderId);
    const next = exists ? list.map(p => (p.orderId === port.orderId ? port : p)) : list.concat([port]);
    return write(KEYS.ports, next);
  }

  /* ==================== 运力通道 ==================== */

  function listCapacities(orderId) {
    return read(KEYS.capacities).filter(c => c.orderId === orderId);
  }

  // 整体替换订单的运力通道
  async function upsertCapacities(orderId, items) {
    const kept = read(KEYS.capacities).filter(c => c.orderId !== orderId);
    return write(KEYS.capacities, kept.concat(items));
  }

  function genCapacityId() {
    return genId('cap');
  }

  /* ==================== 通道详情（公铁联运中转装卸 + 后程公路） ==================== */

  // 空的中转装卸信息
  function emptyLoading() {
    return { equipmentType: '', maxCapacityPerHour: 0, workWindow: '', operatorConfig: '', remark: '' };
  }

  // 空的后程公路信息
  function emptyPostLeg() {
    return { vehicleType: '', idleCapacity: 0, etaHours: 0, cost: 0, carrier: '', remark: '' };
  }

  function getChannelDetail(orderId, channelType) {
    const list = read(KEYS.channelDetails);
    for (let i = 0; i < list.length; i++) {
      if (list[i].orderId === orderId && list[i].channelType === channelType) return Object.assign({}, list[i]);
    }
    return undefined;
  }

  function listChannelDetails(orderId) {
    return read(KEYS.channelDetails).filter(d => d.orderId === orderId);
  }

  // 整体替换订单的通道详情
  async function upsertChannelDetails(orderId, items) {
    const kept = read(KEYS.channelDetails).filter(d => d.orderId !== orderId);
    return write(KEYS.channelDetails, kept.concat(items));
  }

  // 构建空的通道详情
  function buildEmptyDetail(orderId, channelType) {
    return {
      orderId: orderId,
      channelType: channelType,
      loading: emptyLoading(),
      postLeg: emptyPostLeg(),
      updatedAt: new Date().toISOString(),
    };
  }

  /* ==================== 运输方案 ==================== */

  function getPlan(orderId) {
    const list = read(KEYS.plans);
    for (let i = 0; i < list.length; i++) {
      if (list[i].orderId === orderId) return Object.assign({}, list[i]);
    }
    return undefined;
  }

  async function upsertPlan(plan) {
    const list = read(KEYS.plans);
    const exists = list.some(p => p.orderId === plan.orderId);
    const next = exists ? list.map(p => (p.orderId === plan.orderId ? plan : p)) : list.concat([plan]);
    return write(KEYS.plans, next);
  }

  /* ==================== 财务信息 ==================== */

  // 空财务信息（每订单 1 条）
  function emptyFinancial(orderId) {
    return {
      orderId: orderId,
      paymentStatus: 'unpaid',
      totalAmount: 0,
      receivedAmount: 0,
      invoiceStatus: 'none',
      vouchers: [],
      remark: '',
      updatedAt: new Date().toISOString(),
    };
  }

  function getFinancial(orderId) {
    const list = read(KEYS.financials);
    for (let i = 0; i < list.length; i++) {
      if (list[i].orderId === orderId) return Object.assign({}, list[i]);
    }
    return undefined;
  }

  async function upsertFinancial(info) {
    info.updatedAt = new Date().toISOString();
    const list = read(KEYS.financials);
    const exists = list.some(f => f.orderId === info.orderId);
    const next = exists ? list.map(f => (f.orderId === info.orderId ? info : f)) : list.concat([info]);
    return write(KEYS.financials, next);
  }

  /* ==================== 发运信息 ==================== */

  function listShippings(orderId) {
    return read(KEYS.shippings).filter(s => s.orderId === orderId);
  }

  async function upsertShippings(orderId, items) {
    const kept = read(KEYS.shippings).filter(s => s.orderId !== orderId);
    return write(KEYS.shippings, kept.concat(items));
  }

  // 根据运力通道初始化发运信息（缺失则补建，旧数据补全字段）
  // 返回行列表（无论落库成功与否，页面先按返回行渲染；失败时下次保存重试）
  async function ensureShippings(orderId, capacities) {
    const existing = listShippings(orderId);
    const result = capacities.map(c => {
      let found = null;
      for (let i = 0; i < existing.length; i++) {
        if (existing[i].capacityId === c.id) { found = Object.assign({}, existing[i]); break; }
      }
      if (found) {
        found.storedQty = found.storedQty || 0;
        found.pickedUpQty = found.pickedUpQty || 0;
        return found;
      }
      return {
        capacityId: c.id,
        orderId: orderId,
        channelType: c.channelType,
        plannedQty: Number(c.plannedQty) || 0,
        shippedQty: 0,
        storedQty: 0,
        pickedUpQty: 0,
        state: 'not_started',
        planDate: '',
        actualDate: '',
        vouchers: [],
        remark: '',
        updatedAt: new Date().toISOString(),
      };
    });
    await upsertShippings(orderId, result);
    return result;
  }

  /* ==================== 货物动态节点 ==================== */

  function listMilestones(orderId) {
    return read(KEYS.milestones)
      .filter(m => m.orderId === orderId)
      .sort((a, b) => (a.plannedTime < b.plannedTime ? -1 : 1));
  }

  async function upsertMilestones(orderId, items) {
    const kept = read(KEYS.milestones).filter(m => m.orderId !== orderId);
    return write(KEYS.milestones, kept.concat(items));
  }

  function genMilestoneId() {
    return genId('ms');
  }

  /* ==================== 操作日志 ==================== */

  // 日志列表（createdAt 降序）
  function listLogs(orderId) {
    return read(KEYS.logs)
      .filter(l => l.orderId === orderId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async function addOperationLog(orderId, operator, role, action, opts) {
    opts = opts || {};
    const log = {
      id: genId('log'),
      orderId: orderId,
      operator: operator,
      role: role,
      action: action,
      fromStatus: opts.fromStatus,
      toStatus: opts.toStatus,
      remark: opts.remark,
      createdAt: new Date().toISOString(),
    };
    const list = read(KEYS.logs);
    return write(KEYS.logs, list.concat([log]));
  }

  /* ==================== 凭证管理 ==================== */

  // 向目标对象（财务信息 / 发运信息）追加凭证（内存操作，持久化由调用方经 upsertXxx 落库）
  function addVoucher(target, voucher) {
    target.vouchers.push(Object.assign({}, voucher, {
      id: 'vch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      uploadedAt: new Date().toISOString(),
    }));
  }

  // 从目标对象移除凭证（内存操作，持久化由调用方经 upsertXxx 落库）
  function removeVoucher(target, id) {
    const idx = target.vouchers.findIndex(v => v.id === id);
    if (idx >= 0) target.vouchers.splice(idx, 1);
  }

  /* ==================== 挂载共享数据层 ==================== */

  window.HZFlowData = {
    KEYS: KEYS,
    STATUS_META: STATUS_META,
    STATUS_ORDER: STATUS_ORDER,
    STATUS_FLOW: STATUS_FLOW,
    CARGO_CATEGORIES: CARGO_CATEGORIES,
    MINE_OPTIONS: MINE_OPTIONS,
    TRADER_OPTIONS: TRADER_OPTIONS,
    RAIL_CARRIERS: RAIL_CARRIERS,
    ROAD_CARRIERS: ROAD_CARRIERS,
    TRANSFER_OPTIONS: TRANSFER_OPTIONS,
    RAIL_STATION_OPTIONS: RAIL_STATION_OPTIONS,
    ROAD_LOCATION_OPTIONS: ROAD_LOCATION_OPTIONS,
    EQUIPMENT_OPTIONS: EQUIPMENT_OPTIONS,
    VEHICLE_OPTIONS: VEHICLE_OPTIONS,
    VOUCHER_TYPES: VOUCHER_TYPES,
    CONGESTION_OPTIONS: CONGESTION_OPTIONS,
    CHANNEL_META: CHANNEL_META,
    CHANNEL_GROUP_META: CHANNEL_GROUP_META,
    ROLE_META: ROLE_META,
    PAYMENT_META: PAYMENT_META,
    INVOICE_META: INVOICE_META,
    SHIPPING_META: SHIPPING_META,
    toChannelGroup: toChannelGroup,
    isTransitChannel: isTransitChannel,
    channelLabel: channelLabel,
    genId: genId,
    genOrderId: genOrderId,
    fmtNum: fmtNum,
    fmtMoney: fmtMoney,
    fmtDate: fmtDate,
    fmtDateShort: fmtDateShort,
    toLocalInput: toLocalInput,
    esc: esc,
    customersDisplay: customersDisplay,
    customersTotalQty: customersTotalQty,
    migrateStatus: migrateStatus,
    canTransition: canTransition,
    listOrders: listOrders,
    getOrder: getOrder,
    createOrder: createOrder,
    saveOrder: saveOrder,
    deleteOrder: deleteOrder,
    updateOrderStatus: updateOrderStatus,
    transitionStatus: transitionStatus,
    getPort: getPort,
    upsertPort: upsertPort,
    listCapacities: listCapacities,
    upsertCapacities: upsertCapacities,
    genCapacityId: genCapacityId,
    emptyLoading: emptyLoading,
    emptyPostLeg: emptyPostLeg,
    getChannelDetail: getChannelDetail,
    listChannelDetails: listChannelDetails,
    upsertChannelDetails: upsertChannelDetails,
    buildEmptyDetail: buildEmptyDetail,
    getPlan: getPlan,
    upsertPlan: upsertPlan,
    emptyFinancial: emptyFinancial,
    getFinancial: getFinancial,
    upsertFinancial: upsertFinancial,
    listShippings: listShippings,
    upsertShippings: upsertShippings,
    ensureShippings: ensureShippings,
    listMilestones: listMilestones,
    upsertMilestones: upsertMilestones,
    genMilestoneId: genMilestoneId,
    listLogs: listLogs,
    addOperationLog: addOperationLog,
    addVoucher: addVoucher,
    removeVoucher: removeVoucher,
  };
})();
