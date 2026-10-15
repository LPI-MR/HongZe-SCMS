// ===== transport 公共数据层 =====
// 调度看板（transport.js）与信息录入页（transport-entry.js）共享：
//  - 通道模式与节点链定义
//  - 车次数据（localStorage 持久化，两页实时共享）
//  - 录入日志
// 后续接入后端时，仅需替换本文件的 load/save 实现。
(function () {
  'use strict';

  const STORAGE_KEY = 'hz-scms-trips-v2';
  const OLD_STORAGE_KEY = 'hz-scms-trips-v1'; // v1：无到货重量字段的旧版本
  const LOG_KEY = 'hz-scms-trip-logs-v1';

  // 通道模式及节点链（车次的 nodeIndex 即当前到达的节点下标，最后一节点为终态）
  // custom 为自定义通道：节点链由录入时指定，保存在车次的 nodes 字段上
  const MODES = {
    rail:   { name: '铁路直达', nodes: ['请车', '批复', '装载中', '装载完毕', '发出', '到达', '卸车', '卸车完毕'] },
    inter:  { name: '公铁联运', nodes: ['请车', '批复', '装载中', '装载完毕', '发出', '到达', '短倒', '到达'] },
    road:   { name: '汽运直达', nodes: ['发出', '运输中', '运输完毕'] },
    custom: { name: '自定义通道', nodes: null },
  };
  // 预设模式（custom 单独处理，不参与模拟随机）
  const MODE_KEYS = ['rail', 'inter', 'road'];

  // 初始模拟车次数据（首次访问时写入 localStorage）
  // orderId 为关联的订单号（同一订单可分多个车次运输）
  const minutesAgo = m => Date.now() - m * 60000;

  const SEED_TRIPS = [
    // 铁路直达
    { id: 'YS1013-001', mode: 'rail',  from: '淮安南',   to: '郑州北',   cargo: '煤炭',   tons: 3200, nodeIndex: 0, time: minutesAgo(6),   orderId: 'SO1013-001', actualTons: null },
    { id: 'YS1013-002', mode: 'rail',  from: '连云港东', to: '西安西',   cargo: '钢材',   tons: 2800, nodeIndex: 2, time: minutesAgo(22),  orderId: 'SO1013-002', actualTons: null },
    { id: 'YS1013-003', mode: 'rail',  from: '新沂',     to: '武汉北',   cargo: '石英砂', tons: 1900, nodeIndex: 3, time: minutesAgo(35),  orderId: 'SO1013-003', actualTons: null },
    { id: 'YS1013-004', mode: 'rail',  from: '徐州北',   to: '成都北',   cargo: '化肥',   tons: 2600, nodeIndex: 5, time: minutesAgo(58),  orderId: 'SO1013-004', actualTons: null },
    { id: 'YS1012-018', mode: 'rail',  from: '淮安南',   to: '郑州北',   cargo: '矿粉',   tons: 3100, nodeIndex: 7, time: minutesAgo(126), orderId: 'SO1013-001', actualTons: 3050 },
    // 公铁联运
    { id: 'YS1013-005', mode: 'inter', from: '淮安东',   to: '洛阳西',   cargo: '粮食',   tons: 2200, nodeIndex: 1, time: minutesAgo(15),  orderId: 'SO1013-005', actualTons: null },
    { id: 'YS1013-006', mode: 'inter', from: '宿迁',     to: '邯郸南',   cargo: '钢材',   tons: 2400, nodeIndex: 3, time: minutesAgo(41),  orderId: 'SO1013-006', actualTons: null },
    { id: 'YS1013-007', mode: 'inter', from: '淮安东',   to: '石家庄南', cargo: '煤炭',   tons: 3000, nodeIndex: 6, time: minutesAgo(75),  orderId: 'SO1013-007', actualTons: null },
    { id: 'YS1012-021', mode: 'inter', from: '宿迁',     to: '邯郸南',   cargo: '化肥',   tons: 1800, nodeIndex: 7, time: minutesAgo(158), orderId: 'SO1013-006', actualTons: 1798 },
    // 汽运直达
    { id: 'YS1013-008', mode: 'road',  from: '淮安',     to: '南京',     cargo: '粮食',   tons: 32,   nodeIndex: 0, time: minutesAgo(10),  orderId: 'SO1013-008', actualTons: null },
    { id: 'YS1013-009', mode: 'road',  from: '宿迁',     to: '合肥',     cargo: '石英砂', tons: 28,   nodeIndex: 1, time: minutesAgo(47),  orderId: 'SO1013-009', actualTons: null },
    { id: 'YS1012-025', mode: 'road',  from: '连云港',   to: '徐州',     cargo: '钢材',   tons: 35,   nodeIndex: 2, time: minutesAgo(133), orderId: 'SO1012-025', actualTons: 35.4 },
  ];

  // 种子车次映射（用于旧数据迁移：按车次号回填订单号与到货重量演示值）
  const SEED_MAP = SEED_TRIPS.reduce((map, t) => (map[t.id] = t, map), {});

  // ===== 车次数据读写 =====
  // 常规补齐：为缺失字段回填默认值（新增字段时旧 v2 数据的兼容）
  function migrate(state) {
    let dirty = false;
    state.trips.forEach(t => {
      if (t.orderId === undefined) { t.orderId = ''; dirty = true; }
      if (t.actualTons === undefined) { t.actualTons = null; dirty = true; }
    });
    if (dirty) save(state);
  }

  function load() {
    // 优先读取当前版本数据
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        if (state && Array.isArray(state.trips)) {
          migrate(state);
          return state;
        }
      }
    } catch (e) { /* 数据损坏时走初始化 */ }

    // 从 v1 一次性迁移：种子车次回填订单号与到货重量演示值，其余车次补默认值
    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
      if (old && Array.isArray(old.trips) && old.trips.length) {
        const state = { seq: old.seq || 13, trips: old.trips };
        state.trips.forEach(t => {
          const seed = SEED_MAP[t.id];
          if (seed) {
            t.orderId = seed.orderId;
            t.actualTons = seed.actualTons;
          } else {
            if (t.orderId === undefined) t.orderId = '';
            if (t.actualTons === undefined) t.actualTons = null;
          }
        });
        save(state);
        localStorage.removeItem(OLD_STORAGE_KEY);
        return state;
      }
    } catch (e) { /* 迁移失败时走初始化 */ }

    // 全新初始化
    const state = { seq: 13, trips: SEED_TRIPS.map(t => Object.assign({}, t)) };
    save(state);
    return state;
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // 车次节点链：自定义通道用车次自身 nodes，其余用预设模式节点
  function getNodes(trip) {
    if (trip.mode === 'custom' && Array.isArray(trip.nodes) && trip.nodes.length) return trip.nodes;
    const m = MODES[trip.mode];
    return m && m.nodes ? m.nodes : [];
  }

  // 车次所属通道名称
  function modeName(trip) {
    const m = MODES[trip.mode];
    return m ? m.name : '自定义通道';
  }

  // 亏吨率（%）：(运输重量 - 实际到货重量) / 运输重量 × 100
  // 未到货（actualTons 为空）返回 null；负值表示溢吨
  function lossRate(trip) {
    const plan = Number(trip.tons);
    const actual = trip.actualTons == null ? NaN : Number(trip.actualTons);
    if (!plan || isNaN(actual)) return null;
    return (plan - actual) / plan * 100;
  }

  // 车次是否已完成（到达终态节点）
  function isDone(trip) {
    const nodes = getNodes(trip);
    return nodes.length > 0 && trip.nodeIndex === nodes.length - 1;
  }

  // 生成下一个车次号（消耗 state.seq，调用方负责 save）
  function nextId(state) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `YS${p(d.getMonth() + 1)}${p(d.getDate())}-${String(state.seq++).padStart(3, '0')}`;
  }

  // ===== 录入日志 =====
  function getLogs() {
    try {
      const logs = JSON.parse(localStorage.getItem(LOG_KEY));
      return Array.isArray(logs) ? logs : [];
    } catch (e) {
      return [];
    }
  }

  function pushLog(entry) {
    const logs = getLogs();
    logs.unshift(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, 50)));
  }

  // ===== 共用工具 =====
  // 用户输入转义（防注入，用于 innerHTML 渲染）
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // 节点进度条 HTML（调度看板与录入页预览共用）
  function stepperHTML(trip) {
    const nodes = getNodes(trip);
    return '<div class="stepper">' + nodes.map((n, i) => {
      const state = i < trip.nodeIndex ? 'done' : i === trip.nodeIndex ? 'current' : 'todo';
      return `<div class="step ${state}"><span class="dot"></span><span class="step-name">${n}</span></div>`;
    }).join('') + '</div>';
  }

  window.TripsStore = {
    MODES, MODE_KEYS,
    load, save, isDone, nextId,
    getNodes, modeName, lossRate,
    getLogs, pushLog,
    esc, stepperHTML,
  };
})();
