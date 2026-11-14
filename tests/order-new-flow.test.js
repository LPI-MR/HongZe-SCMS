/* ============================================================
   订单管理模块 · 提交链路集成测试
   ------------------------------------------------------------
   运行：node --test tests/order-new-flow.test.js
   覆盖：新建订单提交端到端（订单落库 → 港口预填 → 运力预填）、
         海运航次自动同步（R1/AC-O09 vessel_info 9 项）、
         台账握手（FR-03）、状态机流转、订单删除级联、
         E8 幂等防重、E9 保存失败透传、o5 静态接线契约。
   环境说明：flow-data.js 为浏览器 IIFE（window.HZFlowData），
   Node 下以 mock 的 window / localStorage 模拟浏览器全局。
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* ---------- 浏览器全局模拟 ---------- */

function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
  };
}

const mockStorage = makeStorage();
global.localStorage = mockStorage;

const ledgerCalls = [];   // 记录台账联动调用（FR-03 握手）
global.window = {
  HZUnits: {
    // 与 common/units.js 同口径：吨 → 万吨，非法/0 返回 null
    normalizeTo: (v, from, to) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n / 10000 : null;
    },
  },
  HZBusinessData: {
    syncFlowOrder: order => ledgerCalls.push(order),
    removeFlowOrder: id => ledgerCalls.push({ __removed: id }),
  },
};

global.window.HZFlowData = (() => {
  require('../business/flow/flow-data.js'); // 浏览器 IIFE 挂载到 window.HZFlowData
  return global.window.HZFlowData;
})();
const data = global.window.HZFlowData;
const D = require('../business/flow/order-new-data.js');

/* ---------- 复用夹具 ---------- */

const SUBJECT_OK = {
  ok: true,
  source: 'login',
  subject: { company: '泓泽宜通供应链管理有限公司', contact: '平台运营部', phone: '0310-8888888' },
};

// 复刻 order-new.js submitOrder 的完整提交链（除 toast/跳转）
function submitChain(over) {
  const payload = Object.assign({
    mine: '力拓',
    category: 'PB粉、杨迪粉、罗布河粉',
    cargoName: 'PB粉',
    cargoQuality: '品位 62%',
    tonnage: '70000',
    price: '800.00',
    port: '黄骅港',
    arrivalAt: '2026-11-13T08:00',
    departAt: '2026-11-14T09:30',
    wharfs: ['矿石码头', '综合码头'],
    vessel: '远盛海 008',
    destination: { station: '武安站', yard: '河北陆港保税物流中心（保税堆场）', steel: '天铁集团' },
    vesselInfo: {
      company: '中远海运', scale: '5万吨级', type: '散堆船', route: '青岛—黄骅',
      runTime: '3天', seaPrice: '45元/吨', cycleTime: '7天', shipper: '发货方', consignee: '收货方',
    },
    plans: D.computeSmartPlans({ tonnage: '70000', port: '黄骅港', destination: { station: '武安站', yard: '河北陆港保税物流中心（保税堆场）' } }),
  }, over || {});

  const res = D.validateForm(payload, SUBJECT_OK);
  assert.equal(res.ok, true, '提交前表单校验应通过');

  const order = D.buildOrder(payload, SUBJECT_OK);
  order.id = data.genOrderId();
  order.status = 'port'; // F6①：提交即进入「待港口」
  const nowIso = new Date().toISOString();
  order.createdAt = nowIso;
  order.updatedAt = nowIso;
  data.saveOrder(order);                                   // 落库 + 台账/航次联动
  data.upsertPort(D.buildPortPrefill(order));              // 港口信息预填
  data.upsertCapacities(order.id, D.buildCapacityPrefills(order, payload.plans, data.genCapacityId)); // 运力预填
  return { payload, order, plansRes: payload.plans };
}

function oceanVoyages() {
  try {
    const v = JSON.parse(mockStorage.getItem('hz_ocean_voyages'));
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

/* ==================== 1. 提交端到端（F6③ / TBD-10） ==================== */

test('提交链路：订单落库为「待港口」且时间戳为 ISO', () => {
  mockStorage.clear();
  const { order } = submitChain();
  const saved = data.getOrder(order.id);
  assert.ok(saved, '订单已落库');
  assert.equal(saved.status, 'port');
  assert.match(saved.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.match(saved.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(saved.trader, SUBJECT_OK.subject.company);
  assert.equal('draftMark' in saved, false); // AC-O04
});

test('提交链路：港口信息预填（TBD-10：港口名/码头首项/拥堵度正常）', () => {
  mockStorage.clear();
  const { order } = submitChain();
  const port = data.getPort(order.id);
  assert.ok(port, '港口记录已生成');
  assert.equal(port.orderId, order.id);
  assert.equal(port.portName, '黄骅港');
  assert.equal(port.wharf, '矿石码头');
  assert.equal(port.congestion, 'normal');
  assert.equal(port.waitHours, 0);
});

test('提交链路：运力方案预填 3 行且数值留 0 人工确认（TBD-10）', () => {
  mockStorage.clear();
  const { order } = submitChain();
  const rows = data.listCapacities(order.id);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.channelType), ['road', 'rail_transit', 'rail_direct']);
  rows.forEach(r => {
    assert.equal(r.orderId, order.id);
    assert.equal(r.origin, '黄骅港');
    assert.equal(r.destination, '河北陆港保税物流中心（保税堆场）');
    assert.equal(r.plannedQty, 0);
    assert.equal(r.price, 0);
    assert.equal(r.carrier, '');
  });
  assert.equal(rows[1].transfer, '武安站'); // 公铁联运中转站点预填
  const ids = rows.map(r => r.id);
  assert.equal(new Set(ids).size, 3, '通道 id 不重复');
});

/* ==================== 2. 海运航次联动（R1 / AC-O09） ==================== */

test('海运联动：船名+货量齐备时自动生成航次，vessel_info 9 项随单同步（AC-O09）', () => {
  mockStorage.clear();
  const { order } = submitChain();
  const voyages = oceanVoyages().filter(v => v.flow_ref === order.id);
  assert.equal(voyages.length, 1, '按 flow_ref 幂等生成 1 条航次');
  const rec = voyages[0];
  assert.match(rec.voyage_code, /^S-\d{3}$/);
  assert.equal(rec.vessel_name, '远盛海 008');
  assert.equal(rec.discharge_port, '黄骅港');
  assert.equal(rec.cargo_type, 'PB粉');
  assert.equal(rec.mine_name, '力拓');
  assert.equal(rec.quantity, 7); // 70000 吨 = 7 万吨
  assert.equal(rec.status, 'pending'); // 海运侧状态由海运模块维护
  assert.ok(rec.remark.indexOf(order.id) >= 0);
  const keys = Object.keys(rec.vessel_info || {});
  assert.deepEqual(keys.sort(), ['company', 'consignee', 'cycleTime', 'route', 'runTime', 'scale', 'seaPrice', 'shipper', 'type'].sort());
  assert.equal(rec.vessel_info.company, '中远海运');
  assert.equal(rec.vessel_info.consignee, '收货方');
});

test('海运联动：未填船名不同步（航运信息未完整）', () => {
  mockStorage.clear();
  const { order } = submitChain({ vessel: '' });
  assert.equal(oceanVoyages().filter(v => v.flow_ref === order.id).length, 0);
});

test('海运联动：货量为 0 不同步（单位换算非法不落库）', () => {
  mockStorage.clear();
  // tonnage=0 属 E3 非法值，validateForm 会拦截（另测）；此处直接构造落库验证同步口径
  const order = D.buildOrder({
    mine: '力拓', cargoName: 'PB粉', cargoQuality: '品位 62%', tonnage: '0',
    price: '800', port: '黄骅港', wharfs: [], vessel: '远盛海 008',
    destination: { station: '武安站', yard: '河北陆港保税物流中心（保税堆场）', steel: '' },
    vesselInfo: { company: '中远海运' },
    plans: { triggered: false, missing: [], plans: [] },
  }, SUBJECT_OK);
  assert.equal(D.validateTonnage('0'), D.MSG.tonnageInvalid); // E3 拦截口径
  order.id = data.genOrderId();
  order.status = 'port';
  order.createdAt = new Date().toISOString();
  data.saveOrder(order);
  assert.equal(order.cargoTotal, 0);
  assert.equal(oceanVoyages().filter(v => v.flow_ref === order.id).length, 0);
});

test('海运联动：重复保存幂等更新（E8 防重口径，航次不重复生成）', () => {
  mockStorage.clear();
  const { order } = submitChain();
  // 模拟再次保存（如回到上一步修改后重新提交）
  order.vesselInfo.company = '招商轮船';
  data.saveOrder(order);
  const voyages = oceanVoyages().filter(v => v.flow_ref === order.id);
  assert.equal(voyages.length, 1);
  assert.equal(voyages[0].vessel_info.company, '招商轮船'); // vessel_info 随单更新
  assert.equal(data.listOrders().filter(o => o.id === order.id).length, 1); // 订单 upsert 不重复
  assert.equal(data.listCapacities(order.id).length, 3); // 运力整体替换不重复
});

/* ==================== 3. 台账握手与状态机（FR-03 / F6②） ==================== */

test('台账握手：saveOrder 触发 syncFlowOrder 调用（状态过滤由 business-data 承担）', () => {
  mockStorage.clear();
  ledgerCalls.length = 0;
  const { order } = submitChain();
  const hit = ledgerCalls.find(c => c && c.id === order.id);
  assert.ok(hit, '台账联动已接收流程订单');
  assert.equal(hit.status, 'port');
});

test('状态机：待港口 → 待运力合法，回退非法', () => {
  mockStorage.clear();
  const { order } = submitChain();
  assert.equal(data.transitionStatus(order.id, 'capacity', '销售', 'sales'), true);
  assert.equal(data.getOrder(order.id).status, 'capacity');
  assert.equal(data.transitionStatus(order.id, 'draft', '销售', 'sales'), false, '不允许回退');
  assert.equal(data.getOrder(order.id).status, 'capacity');
});

test('状态机：admin 可跳步至待确认（后续台账同步点）', () => {
  mockStorage.clear();
  const { order } = submitChain();
  assert.equal(data.transitionStatus(order.id, 'pending_confirm', '管理员', 'admin'), true);
  assert.equal(data.getOrder(order.id).status, 'pending_confirm');
  assert.equal(D.isLedgerSynced('pending_confirm'), true);
});

/* ==================== 4. 订单编号与删除级联 ==================== */

test('订单编号：HZyyyyMMddNNNN 当日流水递增', () => {
  mockStorage.clear();
  const a = data.genOrderId();
  assert.match(a, /^HZ\d{8}\d{4}$/);
  // genOrderId 只读不写：落一条订单后再取号应递增
  data.saveOrder({ id: a, status: 'draft', createdAt: new Date().toISOString() });
  const b = data.genOrderId();
  assert.equal(Number(b.slice(-4)), Number(a.slice(-4)) + 1);
});

test('删除订单：级联清空订单/港口/运力/航次并联动台账（R1/FR-03）', () => {
  mockStorage.clear();
  const { order } = submitChain();
  ledgerCalls.length = 0;
  data.deleteOrder(order.id);
  assert.equal(data.getOrder(order.id), undefined);
  assert.equal(data.getPort(order.id), undefined);
  assert.equal(data.listCapacities(order.id).length, 0);
  assert.equal(oceanVoyages().filter(v => v.flow_ref === order.id).length, 0);
  assert.ok(ledgerCalls.some(c => c && c.__removed === order.id), '台账联动收到删除通知');
});

/* ==================== 5. E9 保存失败透传（页面保留表单重试） ==================== */

test('E9：存储异常时 saveOrder 抛错（页面 catch 提示重试，不静默丢单）', () => {
  mockStorage.clear();
  const originalSet = mockStorage.setItem;
  mockStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    assert.throws(() => {
      const order = D.buildOrder({
        mine: '力拓', cargoName: 'PB粉', cargoQuality: '品位 62%', tonnage: '70000',
        price: '800', port: '黄骅港', wharfs: [], vessel: '',
        destination: { station: '武安站', yard: '河北陆港保税物流中心（保税堆场）', steel: '' },
        vesselInfo: null, plans: { triggered: false, missing: [], plans: [] },
      }, SUBJECT_OK);
      order.id = data.genOrderId();
      order.status = 'port';
      data.saveOrder(order);
    }, /QuotaExceededError/);
  } finally {
    mockStorage.setItem = originalSet;
  }
});

/* ==================== 6. o5 静态接线契约（默认首屏 / 导航 / 入口） ==================== */

const ROOT = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

test('接线：server.js 根路径默认重写至新建订单页（PRD F1 登录即建单）', () => {
  const src = read('server.js');
  assert.ok(src.indexOf("'/business/flow/order-new.html'") >= 0, 'server.js 需含 order-new.html 重写');
  assert.ok(src.indexOf("tries.push('/index.html')") >= 0, '原首页保留可达');
});

test('接线：导航与路由注册「订单管理」一级菜单', () => {
  assert.ok(read('common/navbar.html').indexOf('data-path="订单管理"') >= 0, 'navbar.html 需含订单管理一级项');
  assert.ok(read('common/fetch.js').indexOf("'/business/flow/order-new.html'") >= 0, 'fetch.js NAV_ROUTES 需注册路由');
});

test('接线：业务总览退役，入口链路改由订单管理/订单台账承接（PRD-业务总览整合）', () => {
  // 1. 页面与专属脚本已退役
  assert.ok(!fs.existsSync(path.join(ROOT, 'business/business.html')), 'business.html 已删除');
  assert.ok(!fs.existsSync(path.join(ROOT, 'business/flow/overview.js')), 'overview.js 已删除');
  // 2. 菜单与路由不再含业务总览
  assert.ok(read('common/navbar.html').indexOf('业务管理 / 业务总览') < 0, 'navbar.html 不再含业务总览子项');
  assert.ok(read('common/fetch.js').indexOf('business.html') < 0, 'fetch.js 路由表不再含 business.html');
  // 3. 旧地址重定向至订单台账（server.js 302）
  const srv = read('server.js');
  assert.ok(srv.indexOf('/business/business.html') >= 0 && srv.indexOf('/business/orders.html') >= 0,
    'server.js 含旧地址重定向至订单台账');
  // 4. 流程页返回触点全部落至订单台账
  ['order-new.html', 'order-form.html', 'order-plan.html', 'order-port.html', 'order-capacity.html', 'order-detail.html']
    .forEach(f => {
      const h = read('business/flow/' + f);
      assert.ok(h.indexOf('href="../orders.html"') >= 0, f + ' 返回链接指向订单台账');
      assert.ok(h.indexOf('business.html') < 0, f + ' 无 business.html 残留');
    });
  const dj = read('business/flow/order-detail.js');
  assert.ok(dj.indexOf("location.href = '../orders.html'") >= 0, '删除订单后落至订单台账');
  // 5. 流程页导航高亮「订单管理」一级菜单
  ['order-form.js', 'order-port.js', 'order-capacity.js', 'order-plan.js', 'order-detail.js']
    .forEach(f => {
      const s = read('business/flow/' + f);
      assert.ok(s.indexOf("NAV_PATH = '订单管理'") >= 0, f + ' 高亮订单管理');
      assert.ok(s.indexOf('业务管理 / 业务总览') < 0, f + ' 无业务总览高亮残留');
    });
  // 6. 存量草稿兼容：order-form.html 保留（NEXT_ACTION.draft 继续录入不换链）
  assert.ok(read('business/flow/order-form.html').length > 0, 'order-form.html 保留');
});

test('接线：完成方案弹窗与订单详情页提供第四环节「运输方案」入口', () => {
  // 1. 完成弹窗：含「继续运输方案」主按钮与「进入订单详情」次级入口
  const cap = read('business/flow/order-capacity.html');
  assert.ok(cap.indexOf('id="btn-goto-plan"') >= 0, '完成弹窗需含继续运输方案入口');
  assert.ok(cap.indexOf('id="btn-goto-detail"') >= 0, '完成弹窗需含进入订单详情入口');
  assert.ok(cap.indexOf('>继续运输方案<') >= 0, '弹窗主按钮文案为继续运输方案');
  // 2. order-capacity.js：弹窗入口 href 装配（带订单 id）
  const capJs = read('business/flow/order-capacity.js');
  assert.ok(capJs.indexOf("btnGotoPlan: $('btn-goto-plan')") >= 0, 'els 需映射 btn-goto-plan');
  assert.ok(capJs.indexOf("btnGotoDetail: $('btn-goto-detail')") >= 0, 'els 需映射 btn-goto-detail');
  assert.ok(capJs.indexOf("els.btnGotoPlan.href = 'order-plan.html?id='") >= 0, '弹窗运输方案链接需装配');
  assert.ok(capJs.indexOf("els.btnGotoDetail.href = 'order-detail.html?id='") >= 0, '弹窗订单详情链接需装配');
  // 3. 订单详情页：页头「运输方案」入口 + href 装配（台账→流程详情→详情→运输方案 链路承接）
  const det = read('business/flow/order-detail.html');
  assert.ok(det.indexOf('id="btn-goto-plan"') >= 0, '订单详情页头需含运输方案入口');
  const detJs = read('business/flow/order-detail.js');
  assert.ok(detJs.indexOf("btnGotoPlan: $('btn-goto-plan')") >= 0, 'els 需映射 btn-goto-plan');
  assert.ok(detJs.indexOf("els.btnGotoPlan.href = 'order-plan.html?id='") >= 0, '详情页运输方案链接需装配');
  // 4. 运输方案页自身可达性：步骤条第 3 步回退链接保留（运输方案 → 运力方案 可回溯）
  const plan = read('business/flow/order-plan.html');
  assert.ok(plan.indexOf('id="step-back-capacity"') >= 0, '运输方案页需保留运力方案回退入口');
});

test('接线：新建订单页脚本装配顺序完整（根绝对路径，默认首屏 / 与深层 URL 均可用）', () => {
  const html = read('business/flow/order-new.html');
  ['/common/fetch.js', '/common/hz-data.js', '/common/units.js',
   '/business/flow/flow-data.js', '/business/flow/order-new-data.js',
   '/business/business-data.js', '/customers/data.js', '/business/flow/order-new.js']
    .forEach(s => assert.ok(html.indexOf(s) >= 0, '缺少脚本引用：' + s));
  // 页面样式同为根绝对路径（相对路径在根 URL 服务时会导致 404）
  assert.ok(html.indexOf('/business/flow/order-new.css') >= 0, '页面样式引用');
  assert.ok(html.indexOf('href="flow.css"') < 0 && html.indexOf('src="flow-data.js"') < 0,
    '不得残留相对路径资源引用');
});
