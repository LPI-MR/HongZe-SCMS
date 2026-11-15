// ===== transport 公共数据层 =====
// 调度看板（transport.js）与信息录入页（transport-entry.js）共享：
//  - 通道模式与节点链定义
//  - 车次数据（PostgreSQL ops.trip 表持久化，读经 HZDB 缓存、写经 PUT /api/trips）
//  - 录入日志（ops.trip_log 表）
(function () {
  'use strict';

  // 通道模式及节点链（车次的 nodeIndex 即当前到达的节点下标，最后一节点为终态）
  // custom 为自定义通道：节点链由录入时指定，保存在车次的 nodes 字段上
  const MODES = {
    rail:   { name: '铁路直达', nodes: ['请车', '批复', '装载中', '装载完毕', '发出', '到达', '卸车', '卸车完毕', '到库'] },
    inter:  { name: '公铁联运', nodes: ['请车', '批复', '装载中', '装载完毕', '发出', '到达', '短倒', '到达', '到库'] },
    road:   { name: '汽运直达', nodes: ['发出', '运输中', '运输完毕'] },
    custom: { name: '自定义通道', nodes: null },
  };
  // 预设模式（custom 单独处理，不参与模拟随机）
  const MODE_KEYS = ['rail', 'inter', 'road'];

  // ===== 车次数据读写 =====
  // 常规补齐：为缺失字段回填默认值（仅补内存，随下次写操作一并落库）
  function migrate(state) {
    state.trips.forEach(t => {
      if (t.orderId === undefined) t.orderId = '';
      if (t.actualTons === undefined) t.actualTons = null;
      if (t.loadedTons === undefined) t.loadedTons = null;
    });
  }

  // 读取车次数据：{seq, trips}（同步读 HZDB 缓存，须在 HZDB.ready() 之后调用）
  // seq 为车次流水号，持久化在字典 meta.dict_entry sys/trip_seq
  function load() {
    if (!window.HZDB) return { seq: 0, trips: [] };
    const trips = HZDB.get('trips');
    const state = {
      seq: Number(HZDB.seq()) || 0,
      trips: Array.isArray(trips) ? trips : [],
    };
    migrate(state);
    return state;
  }

  // 保存车次数据（PUT /api/trips，body {seq, trips[]}）；async，失败返回 false
  // （HZDB 已 toast 提示），由调用方恢复内存现场
  function save(state) {
    return HZDB.put('trips', state.trips, { seq: state.seq });
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
  // 日志持久化在 ops.trip_log 表（tripLogs 资源，GET 按时间倒序——新日志在前）
  function getLogs() {
    if (!window.HZDB) return [];
    const logs = HZDB.get('tripLogs');
    return Array.isArray(logs) ? logs : [];
  }

  // 追加录入日志（保留最近 50 条）；async，失败仅 toast 提示，不阻断主流程
  function pushLog(entry) {
    if (!window.HZDB) return Promise.resolve(false);
    const logs = getLogs();
    logs.unshift({
      tripId: entry.tripId,
      action: entry.action,
      time: entry.time || Date.now(),
    });
    return HZDB.put('tripLogs', logs.slice(0, 50));
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
