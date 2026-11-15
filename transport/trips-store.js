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

  // ===== 跨系统联动：车次 ⇄ 业务订单台账（运输系统 → 业务系统） =====
  // 关联键：trip.orderId ←→ ledger.order_code（公共字段直接映射，映射表见 docs/系统使用说明.md）
  // 联动时机：save 落库成功后按当前车次「绝对状态」幂等联动台账（重复执行结果一致，无增量依赖）
  const LINK_OPERATOR = '运输调度系统';   // 联动写台账日志的操作者标识
  // 台账状态机（与 business/business-data.js 的 ORDER_FLOW 保持一致，人工闸门见 R0）
  const LEDGER_FLOW = ['待确认', '已确认', '执行中', '已发运', '已完成'];
  const LEDGER_TERMINAL = '已终止';
  // 最近一次联动结果（供录入页 toast 提示）：{advanced:[{code,from,to}], cleared:[车次号]}
  let lastSync = { advanced: [], cleared: [] };

  // 业务数据层句柄（页面未引入 business-data.js 时联动静默降级，仅保证车次落库）
  function biz() { return window.HZBusinessData || null; }

  // 车次是否已发出：节点链含「发出」节点 → nodeIndex 达到该下标即发出；
  // 自定义链无「发出」节点 → 推进过至少 1 个节点视为已发出（road 链「发出」为第 0 节点，即创建即发出）
  function isDeparted(trip) {
    const nodes = getNodes(trip);
    const idx = nodes.indexOf('发出');
    return idx >= 0 ? trip.nodeIndex >= idx : trip.nodeIndex > 0;
  }

  // 台账订单选项（业务 → 运输方向）：供录入页「关联订单」下拉。
  // 返回 [{code, cargo, qty, used, remaining, status}]，已终止订单不参与关联
  function ledgerOrderOptions() {
    const B = biz();
    if (!B || !window.HZDB) return [];
    const trips = HZDB.get('trips');
    const linked = new Map();  // order_code → 已关联车次吨位合计
    (Array.isArray(trips) ? trips : []).forEach(t => {
      const code = (t.orderId || '').trim();
      if (!code) return;
      linked.set(code, (linked.get(code) || 0) + (Number(t.tons) || 0));
    });
    return B.loadOrders()
      .filter(o => o.status !== LEDGER_TERMINAL)
      .map(o => {
        const qty = Number(o.cargo_qty) || 0;
        const used = linked.get(o.order_code) || 0;
        return {
          code: o.order_code,
          cargo: o.cargo_name || '',
          qty: qty,
          used: used,
          remaining: qty - used,   // 剩余待运量 = 订单货量 − 已关联车次吨位合计（同口径：吨）
          status: o.status,
        };
      });
  }

  // 联动主函数（幂等）：车次数据落库后调用，把台账推进到车次进度支持的状态
  //  R0 人工闸门：「待确认 → 已确认」为业务确认动作，联动永不自动跨越（当前待确认则只重建关联不推状态）
  //  R1 关联即执行：订单存在关联车次 → 至少推进到「执行中」
  //  R2 发出即发运：任一关联车次已发出 → 至少推进到「已发运」
  //  R3 到库即完成：全部关联车次到库 → 推进到「已完成」（关联车次数为 0 不触发）
  //  R4 关联表重建：order_ledger_trip（trip_ids）始终与车次 orderId 保持一致
  //  R5 引用清洗：orderId 指向不存在 / 已终止的订单 → 内存解除关联，由调用方重存车次
  // 推进方式：沿状态机逐级推进，每跨一级写一条台账日志（保持「禁止跳级」约束，各级依据数据自洽）
  async function syncLedger() {
    const result = { advanced: [], cleared: [] };
    const B = biz();
    if (!B || !window.HZDB) return result;

    const trips = HZDB.get('trips');
    const tripArr = Array.isArray(trips) ? trips : [];
    const orders = B.loadOrders();

    // R5 引用校验 + 按 order_code 分组
    const valid = new Map();               // order_code → 台账订单（排除已终止）
    orders.forEach(o => {
      if (o.status !== LEDGER_TERMINAL && o.order_code) valid.set(o.order_code, o);
    });
    const groups = new Map();              // order_code → [trip, ...]
    tripArr.forEach(t => {
      const code = (t.orderId || '').trim();
      if (!code) return;
      if (valid.has(code)) {
        if (!groups.has(code)) groups.set(code, []);
        groups.get(code).push(t);
      } else if (!result.cleared.includes(t.id)) {
        t.orderId = '';                    // 引用失效：清除内存引用（订单已删除 / 已终止）
        result.cleared.push(t.id);
      }
    });

    // R1-R3 逐单推进 + R4 关联表对齐
    const newLogs = [];                    // 待写台账日志（生成序 = 推进序，落库前反转为最新在前）
    let ordersDirty = false;
    groups.forEach((tripsOf, code) => {
      const o = valid.get(code);
      const start = LEDGER_FLOW.indexOf(o.status);
      // R0 人工闸门：待确认（下标 0）→ 已确认 为业务确认动作，联动不自动跨越；
      // 非流转状态（已终止等，indexOf=-1）同样不推进
      if (start < 1) return;
      const allDone = tripsOf.every(isDone);
      const anyDeparted = tripsOf.some(isDeparted);
      const target = allDone ? '已完成' : anyDeparted ? '已发运' : '执行中';
      const end = LEDGER_FLOW.indexOf(target);
      if (end > start) {
        const rep = tripsOf.map(t => t.id).join('、');
        for (let i = start; i < end; i++) {
          const from = LEDGER_FLOW[i], to = LEDGER_FLOW[i + 1];
          o.status = to;
          // 各级推进的业务依据：能跨到该级说明触发条件已被当前车次数据满足
          const reason = to === '执行中' ? `车次 ${rep} 关联订单，开始执行`
            : to === '已发运' ? `车次 ${rep} 已发出`
            : `关联车次 ${rep} 全部到库`;
          newLogs.push({
            id: 'log' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            order_id: o.id,
            from_status: from,
            to_status: to,
            operator: LINK_OPERATOR,
            time: Date.now(),
            remark: '运输调度联动：' + reason,
          });
          result.advanced.push({ code: code, from: from, to: to });
        }
        o.updated_at = Date.now();
        ordersDirty = true;
      }
    });
    orders.forEach(o => {
      const g = groups.get(o.order_code) || [];
      const ids = g.map(t => t.id);
      if (JSON.stringify(ids) !== JSON.stringify(Array.isArray(o.trip_ids) ? o.trip_ids : [])) {
        o.trip_ids = ids;                  // R4：关联表随台账 children 重建落库
        ordersDirty = true;
      }
    });

    // 落库：日志在前（截断式全量替换，最新在前），订单在后；失败不阻断车次数据本身
    if (newLogs.length) {
      const merged = newLogs.slice().reverse().concat(B.loadLogs());
      await B.saveLogs(merged);
    }
    if (ordersDirty) await B.saveOrders(orders);
    return result;
  }

  // 保存车次数据（PUT /api/trips，body {seq, trips[]}）；async，失败返回 false
  // 落库成功后自动执行车次 → 台账联动（幂等）；联动异常不影响车次数据本身
  async function save(state) {
    const ok = await HZDB.put('trips', state.trips, { seq: state.seq });
    if (!ok) return false;
    lastSync = { advanced: [], cleared: [] };
    try {
      lastSync = await syncLedger();
      if (lastSync.cleared.length) {
        // R5 清洗后重存车次使解除关联生效（此时分组已稳定，不会再次触发清洗）
        await HZDB.put('trips', state.trips, { seq: state.seq });
      }
    } catch (e) { /* 联动异常不影响车次保存结果 */ }
    return true;
  }

  // 最近一次联动结果（录入页保存成功后读取用于提示）
  function getLastSync() { return lastSync; }

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

  // 节点符号表：每个环节的符号可视化表达。
  // 匹配顺序：「模式:节点」精确匹配 → 通用节点名 → 回退符号（自定义通道的未知节点）
  const NODE_ICONS = {
    '请车': '📋', '批复': '✅', '装载中': '🏗️', '装载完毕': '📦',
    '发出': '🚂', '到达': '📍', '短倒': '🔁', '卸车': '📤', '卸车完毕': '📥', '到库': '🏭',
    'road:发出': '🚚', '运输中': '🛣️', '运输完毕': '🏁',
  };

  function nodeIcon(mode, name) {
    return NODE_ICONS[mode + ':' + name] || NODE_ICONS[name] || '🚩';
  }

  // 节点进度条 HTML（调度看板与录入页预览共用；dot 为不透明徽章，符号置于内层 .ic 以便独立淡出）
  function stepperHTML(trip) {
    const nodes = getNodes(trip);
    return '<div class="stepper">' + nodes.map((n, i) => {
      const state = i < trip.nodeIndex ? 'done' : i === trip.nodeIndex ? 'current' : 'todo';
      const icon = nodeIcon(trip.mode, n);
      return `<div class="step ${state}"><span class="dot"><i class="ic">${icon}</i></span><span class="step-name">${esc(n)}</span></div>`;
    }).join('') + '</div>';
  }

  window.TripsStore = {
    MODES, MODE_KEYS,
    load, save, isDone, nextId,
    isDeparted, getLastSync,
    ledgerOrderOptions,
    getNodes, modeName, lossRate,
    getLogs, pushLog,
    esc, stepperHTML,
  };
})();
