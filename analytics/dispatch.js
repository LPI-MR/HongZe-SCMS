// ===== 调度数据分析（先选/输订单，再看该订单分析）=====
// 数据来源：
//   调度车次   localStorage 'hz-scms-trips-v2'（与调度看板/信息录入共享）
//   仓储出库   localStorage 'hz_warehouse_io_v1'（进销存台账流水，结构 { list }，r.order 关联订单号）
//   订单台账   localStorage 'hz-scms-orders-v1'（本页维护：订单号 + 总委托量）
// 口径：
//   出港＝车次已过「发出」节点（rail/inter 下标≥4，road 下标≥1）
//   在途＝已发出且未到库；入库＝已到库（优先取实际到货吨 actualTons）
//   出厂＝仓储出库记录（type 'out'）按订单号合计
(function () {
  'use strict';

  const NAV_PATH = '数据分析 / 调度数据分析';

  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
    const item = navbar.querySelector(`[data-path="${NAV_PATH}"]`);
    if (item) {
      item.classList.add('active');
      const group = item.closest('.nav-group');
      if (group) group.classList.add('open');
    }
  }
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) setActiveNav();
  else document.addEventListener('navbar:loaded', setActiveNav, { once: true });

  /* ==================== 数据层 ==================== */

  const TRIPS_KEY = 'hz-scms-trips-v2';
  const IO_KEY = 'hz_warehouse_io_v1';
  const ORDERS_KEY = 'hz-scms-orders-v1';

  // 节点链（与 transport/trips-store.js 保持一致；发出下标 / 终态下标由此推导）
  const NODES = {
    rail: ['请车', '批复', '装载中', '装载完毕', '发出', '到达', '卸车', '卸车完毕', '到库'],
    inter: ['请车', '批复', '装载中', '装载完毕', '发出', '到达', '短倒', '到达', '到库'],
    road: ['发出', '运输中', '运输完毕'],
  };
  const SENT_IDX = { rail: 4, inter: 4, road: 1 };
  const MODE_NAME = { rail: '沧港直达', inter: '公铁联运', road: '汽运直达' };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      return data == null ? fallback : data;
    } catch (e) {
      return fallback;
    }
  }

  function loadTrips() {
    const data = readJSON(TRIPS_KEY, { trips: [] });
    return Array.isArray(data.trips) ? data.trips : [];
  }

  function loadIoRecords() {
    // 仓储出入库存储结构为 { list: [...] }（与 warehouse.js 保存格式一致）
    const data = readJSON(IO_KEY, { list: [] });
    return Array.isArray(data.list) ? data.list : [];
  }

  function loadOrders() {
    const data = readJSON(ORDERS_KEY, { list: [] });
    return Array.isArray(data.list) ? data.list : [];
  }

  function saveOrders(list) {
    localStorage.setItem(ORDERS_KEY, JSON.stringify({ list }));
  }

  function genId() {
    return 'ord-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ==================== 工具 ==================== */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 吨数展示（自带单位）：≥1000 吨折万吨（最多 2 位小数），否则 X吨
  function fmtTon(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1000) return (v / 10000).toFixed(2).replace(/\.?0+$/, '') + '万吨';
    return (Math.round(v * 100) / 100) + '吨';
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function supplierName(id) {
    const data = readJSON('hz_warehouse_suppliers_v1', { list: [] });
    const s = (data.list || []).find(x => x.id === id);
    return s ? s.name : '';
  }

  /* ==================== 订单分析核心 ==================== */

  // 单订单聚合：出港（汽运/沧港直达/公铁联运）、在途（汽运/火运）、入库、出厂
  function analyzeOrder(orderId, trips, ioRecords) {
    const res = {
      tripCount: 0,
      roadPort: 0, railPort: 0, interPort: 0,   // 出港：汽运 / 沧港直达(铁路) / 公铁联运
      roadTransit: 0, railTransit: 0,           // 在途：汽运 / 火运
      inbound: 0,                                // 入库（到库）
      factory: 0, ioCount: 0,                    // 出厂（仓储出库）
      orderTrips: [], orderIos: [],              // 关联明细
    };
    const key = (orderId || '').trim();

    trips.forEach(t => {
      if ((t.orderId || '').trim() !== key) return;
      res.tripCount += 1;
      res.orderTrips.push(t);
      const mode = NODES[t.mode] ? t.mode : null;
      const tons = Number(t.tons) || 0;

      if (mode) {
        const lastIdx = NODES[mode].length - 1;
        const sent = SENT_IDX[mode];
        const departed = t.nodeIndex >= sent;      // 已过「发出」＝出港
        const arrived = t.nodeIndex >= lastIdx;    // 已到终态＝入库
        if (mode === 'road') {
          if (departed) res.roadPort += tons;
          if (departed && !arrived) res.roadTransit += tons;
        } else {
          if (departed) res[mode === 'rail' ? 'railPort' : 'interPort'] += tons;
          if (departed && !arrived) res.railTransit += tons;
        }
        if (arrived) res.inbound += Number(t.actualTons != null ? t.actualTons : t.tons) || 0;
      } else {
        // 自定义通道：节点链在车次上，取「发出」位置，找不到则发出即出港
        const ns = Array.isArray(t.nodes) ? t.nodes : [];
        const sent = ns.indexOf('发出') >= 0 ? ns.indexOf('发出') : 0;
        const departed = t.nodeIndex >= sent;
        const arrived = t.nodeIndex >= ns.length - 1;
        if (departed) res.roadPort += tons;
        if (departed && !arrived) res.roadTransit += tons;
        if (arrived) res.inbound += Number(t.actualTons != null ? t.actualTons : t.tons) || 0;
      }
    });

    // 出厂：仓储出库流水按订单号关联
    ioRecords.forEach(r => {
      if (r.type !== 'out') return;
      if ((r.order || '').trim() !== key) return;
      res.factory += Number(r.tons) || 0;
      res.ioCount += 1;
      res.orderIos.push(r);
    });

    res.portTotal = res.roadPort + res.railPort + res.interPort;
    res.transitTotal = res.roadTransit + res.railTransit;
    return res;
  }

  /* ==================== 页面状态 ==================== */

  let selectedId = null;   // 当前分析订单的记录 id（orders 列表内）

  function getData() {
    return { orders: loadOrders(), trips: loadTrips(), ioRecords: loadIoRecords() };
  }

  function currentOrder(orders) {
    return orders.find(o => o.id === selectedId) || orders[0] || null;
  }

  /* ==================== 渲染 ==================== */

  // ① 订单选择下拉
  function renderPicker(orders) {
    const sel = document.getElementById('order-select');
    const cur = currentOrder(orders);
    if (!cur) {
      sel.innerHTML = '<option value="">暂无订单</option>';
      sel.value = '';
      return;
    }
    const list = orders.slice().sort((a, b) => b.createdAt - a.createdAt);
    sel.innerHTML = list.map(o =>
      `<option value="${esc(o.id)}">${esc(o.orderId)}${o.qty != null ? `（委托 ${esc(fmtTon(o.qty))}）` : '（委托待填）'}</option>`
    ).join('');
    sel.value = cur.id;
    selectedId = cur.id;
  }

  // ② 当前订单分析卡
  function renderDetail(order, trips, ioRecords) {
    const panel = document.getElementById('detail-panel');
    const subPanel = document.getElementById('detail-sub');
    const empty = document.getElementById('detail-empty');
    if (!order) {
      panel.hidden = true;
      subPanel.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    panel.hidden = false;
    subPanel.hidden = false;

    const r = analyzeOrder(order.orderId, trips, ioRecords);
    const qty = Number(order.qty) || 0;
    const pct = qty > 0 ? Math.min(100, Math.round(r.portTotal / qty * 100)) : 0;

    document.getElementById('detail-id').textContent = order.orderId;
    const qtyInput = document.getElementById('detail-qty');
    qtyInput.value = order.qty == null ? '' : order.qty;
    document.getElementById('detail-bar').style.width = pct + '%';
    document.getElementById('detail-bar-tip').textContent = qty > 0
      ? `出港进度 ${pct}%（出港 ${fmtTon(r.portTotal)} ÷ 委托 ${fmtTon(qty)}）· 共 ${r.tripCount} 车 · 仓储出库 ${r.ioCount} 笔`
      : `委托量待填写 · 共 ${r.tripCount} 车 · 仓储出库 ${r.ioCount} 笔`;

    document.getElementById('st-port').textContent = fmtTon(r.portTotal);
    document.getElementById('st-port-sub').innerHTML =
      `汽运 ${esc(fmtTon(r.roadPort))} · 火运 ${esc(fmtTon(r.railPort + r.interPort))}<br/>沧港直达 ${esc(fmtTon(r.railPort))} · 公铁联运 ${esc(fmtTon(r.interPort))}`;

    document.getElementById('st-transit').textContent = fmtTon(r.transitTotal);
    document.getElementById('st-transit-sub').innerHTML =
      `汽运在途 ${esc(fmtTon(r.roadTransit))}<br/>火运在途 ${esc(fmtTon(r.railTransit))}`;

    document.getElementById('st-inbound').textContent = fmtTon(r.inbound);
    document.getElementById('st-inbound-sub').textContent = '已到库（优先实际到货吨）';

    document.getElementById('st-factory').textContent = fmtTon(r.factory);
    document.getElementById('st-factory-sub').textContent = `仓储出库 ${r.ioCount} 笔（按订单号）`;

    // 关联车次明细
    const tripBody = document.getElementById('trip-body');
    tripBody.innerHTML = r.orderTrips.length
      ? r.orderTrips.slice().sort((a, b) => b.time - a.time).map(t => {
          const nodes = NODES[t.mode] || (Array.isArray(t.nodes) ? t.nodes : []);
          const node = nodes[t.nodeIndex] || `节点 ${t.nodeIndex}`;
          return `
          <tr>
            <td>${esc(t.id)}</td>
            <td>${esc(MODE_NAME[t.mode] || (t.mode === 'custom' ? '自定义' : t.mode))}</td>
            <td>${esc(t.from)} → ${esc(t.to)}</td>
            <td>${esc(t.cargo)}</td>
            <td class="num">${esc(fmtTon(t.tons))}</td>
            <td class="num">${t.loadedTons != null ? esc(fmtTon(t.loadedTons)) : '—'}</td>
            <td class="num">${t.actualTons != null ? esc(fmtTon(t.actualTons)) : '—'}</td>
            <td>${esc(node)}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="8" class="sub-empty">该订单暂无调度车次</td></tr>';

    // 仓储出库明细
    const ioBody = document.getElementById('io-body');
    ioBody.innerHTML = r.orderIos.length
      ? r.orderIos.slice().sort((a, b) => b.createdAt - a.createdAt).map(rec => `
          <tr>
            <td>${esc(rec.date || '')}</td>
            <td>${esc(supplierName(rec.supId))}</td>
            <td>${esc(rec.ore)}</td>
            <td class="num">${esc(fmtTon(rec.tons))}</td>
            <td>${rec.steel ? esc(rec.steel) : '—'}</td>
            <td>${rec.note ? esc(rec.note) : '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="6" class="sub-empty">该订单暂无仓储出库记录（出库登记时填写订单号即可关联）</td></tr>';
  }

  // ③ 全部订单一览（兼台账：委托量可编辑、可删除）
  function renderAllTable(orders, trips, ioRecords) {
    const body = document.getElementById('all-body');
    const foot = document.getElementById('all-foot');
    const empty = document.getElementById('all-empty');
    const list = orders.slice().sort((a, b) => b.createdAt - a.createdAt);
    empty.hidden = list.length > 0;

    const total = { qty: 0, port: 0, transit: 0, inbound: 0, factory: 0 };
    body.innerHTML = list.map(o => {
      const r = analyzeOrder(o.orderId, trips, ioRecords);
      const qty = Number(o.qty) || 0;
      total.qty += qty; total.port += r.portTotal; total.transit += r.transitTotal;
      total.inbound += r.inbound; total.factory += r.factory;
      const pct = qty > 0 ? Math.min(100, Math.round(r.portTotal / qty * 100)) : null;
      return `
      <tr data-id="${esc(o.id)}" class="${o.id === selectedId ? 'cur' : ''}">
        <td><a href="javascript:void(0)" data-act="pick">${esc(o.orderId)}</a></td>
        <td class="num"><input class="qty" data-field="qty" type="number" min="0" step="0.1" value="${o.qty == null ? '' : o.qty}" placeholder="待填写" /></td>
        <td class="num">${esc(fmtTon(r.portTotal))}</td>
        <td class="num">${esc(fmtTon(r.transitTotal))}</td>
        <td class="num">${esc(fmtTon(r.inbound))}</td>
        <td class="num">${esc(fmtTon(r.factory))}</td>
        <td class="num">${pct == null ? '—' : pct + '%'}</td>
        <td class="num"><button type="button" class="btn danger sm" data-act="del">删除</button></td>
      </tr>`;
    }).join('');

    foot.innerHTML = list.length ? `
      <tr>
        <td>合计（${list.length} 个订单）</td>
        <td class="num">${esc(fmtTon(total.qty))}</td>
        <td class="num">${esc(fmtTon(total.port))}</td>
        <td class="num">${esc(fmtTon(total.transit))}</td>
        <td class="num">${esc(fmtTon(total.inbound))}</td>
        <td class="num">${esc(fmtTon(total.factory))}</td>
        <td colspan="2"></td>
      </tr>` : '';
  }

  function renderAll() {
    const { orders, trips, ioRecords } = getData();
    renderPicker(orders);
    const cur = currentOrder(orders);
    renderDetail(cur, trips, ioRecords);
    renderAllTable(orders, trips, ioRecords);
  }

  /* ==================== 交互 ==================== */

  // ① 下拉切换订单
  document.getElementById('order-select').addEventListener('change', e => {
    selectedId = e.target.value || null;
    renderAll();
  });

  // ① 登记新订单
  document.getElementById('btn-add').addEventListener('click', () => {
    const idInput = document.getElementById('order-id');
    const qtyInput = document.getElementById('order-qty');
    const orderId = idInput.value.trim();
    if (!orderId) { idInput.focus(); return; }
    const list = loadOrders();
    if (list.some(o => o.orderId === orderId)) { idInput.focus(); return; }
    const qtyRaw = qtyInput.value.trim();
    const rec = { id: genId(), orderId, qty: qtyRaw === '' ? null : Number(qtyRaw), createdAt: Date.now() };
    list.push(rec);
    saveOrders(list);
    selectedId = rec.id;
    idInput.value = ''; qtyInput.value = '';
    renderAll();
  });

  // ① 从调度导入订单号
  document.getElementById('btn-import').addEventListener('click', () => {
    const list = loadOrders();
    const known = new Set(list.map(o => o.orderId));
    const found = new Set(loadTrips().map(t => (t.orderId || '').trim()).filter(Boolean));
    let added = 0;
    let firstNew = null;
    found.forEach(orderId => {
      if (known.has(orderId)) return;
      const rec = { id: genId(), orderId, qty: null, createdAt: Date.now() };
      list.push(rec);
      if (!firstNew) firstNew = rec.id;
      added += 1;
    });
    saveOrders(list);
    if (firstNew) selectedId = firstNew;
    renderAll();
    if (!added) alert('调度车次中的订单号均已登记');
  });

  // ② 详情：委托量编辑 + 删除
  document.getElementById('detail-qty').addEventListener('change', e => {
    const { orders } = getData();
    const cur = currentOrder(orders);
    if (!cur) return;
    const raw = e.target.value.trim();
    cur.qty = raw === '' ? null : Number(raw);
    saveOrders(orders);
    renderAll();
  });

  document.getElementById('detail-del').addEventListener('click', () => {
    if (!selectedId) return;
    saveOrders(loadOrders().filter(o => o.id !== selectedId));
    selectedId = null;
    renderAll();
  });

  // ③ 一览：点击订单号切换分析 / 委托量编辑 / 删除
  document.getElementById('all-body').addEventListener('click', e => {
    const pick = e.target.closest('[data-act="pick"]');
    if (pick) {
      selectedId = pick.closest('tr').dataset.id;
      renderAll();
      return;
    }
    const del = e.target.closest('[data-act="del"]');
    if (del) {
      const id = del.closest('tr').dataset.id;
      saveOrders(loadOrders().filter(o => o.id !== id));
      if (selectedId === id) selectedId = null;
      renderAll();
    }
  });

  document.getElementById('all-body').addEventListener('change', e => {
    const input = e.target.closest('input[data-field="qty"]');
    if (!input) return;
    const id = input.closest('tr').dataset.id;
    const list = loadOrders();
    const order = list.find(o => o.id === id);
    if (!order) return;
    const raw = input.value.trim();
    order.qty = raw === '' ? null : Number(raw);
    saveOrders(list);
    renderAll();
  });

  // 与其他模块共享 localStorage：外部修改后自动同步
  window.addEventListener('storage', e => {
    if (e.key === TRIPS_KEY || e.key === IO_KEY || e.key === ORDERS_KEY) renderAll();
  });
  setInterval(renderAll, 8000);

  renderAll();
})();
