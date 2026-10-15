// ===== transport 模块脚本（调度看板）=====
// 公共导航栏由 /common/fetch.js 加载；车次数据由 trips-store.js 共享，
// 信息录入页（transport-entry.html）提交后本页自动同步显示
(function () {
  'use strict';

  // 本页对应的导航路径（与 navbar.html 中 data-path 一致）
  const NAV_PATH = '运输调度管理 / 调度看板';

  // 设置导航栏选中态：子项高亮 + 展开父级菜单
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

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  /* ==================== 调度看板 ==================== */

  const store = window.TripsStore;
  const MODES = store.MODES;
  const MODE_KEYS = store.MODE_KEYS;
  const isDone = store.isDone;
  const esc = store.esc;

  // KPI 卡片图标
  const ICONS = {
    total: '<svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 12.5 9 5 9-5"/></svg>',
    rail:  '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="13" rx="2.5"/><path d="M5 9.5h14"/><path d="M9 13h.01M15 13h.01"/><path d="M8.5 16 6.5 20M15.5 16l2 4"/><path d="M7 21h10"/></svg>',
    inter: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5h13l-3.2-3.2M20.5 16.5h-13l3.2 3.2"/></svg>',
    road:  '<svg viewBox="0 0 24 24"><path d="M3 16V8l7-2 5 3h4.5a1.5 1.5 0 0 1 1.5 1.5V16"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/><path d="M9.3 17.5h5.4"/></svg>',
  };

  // 路线与货类库（用于模拟新增车次）
  const ROUTES = {
    rail:  [['淮安南', '郑州北'], ['连云港东', '西安西'], ['新沂', '武汉北'], ['徐州北', '成都北']],
    inter: [['淮安东', '洛阳西'], ['宿迁', '邯郸南'], ['淮安东', '石家庄南']],
    road:  [['淮安', '南京'], ['宿迁', '合肥'], ['淮安', '临沂'], ['连云港', '徐州']],
  };
  const CARGOS = ['煤炭', '钢材', '化肥', '粮食', '石英砂', '矿粉'];

  // 共享车次数据（每次 tick 重新 load，同步录入页的修改）
  let state = store.load();

  // 页面状态
  let filterMode = 'all';
  let orderQuery = '';   // 当前查询的订单号（空为不查询）

  // 亏吨预警阈值（%）：亏吨率超过该值标红
  const LOSS_THRESHOLD = 0.5;

  // 重量显示：保留 1 位小数并去掉尾零
  const fmtTons = v => Number(Number(v).toFixed(1));

  // 亏吨率展示片段：负值为溢吨；超过阈值标红
  function lossPartHTML(t) {
    const rate = store.lossRate(t);
    if (rate == null) return '';
    const text = rate < 0 ? `溢吨 ${Math.abs(rate).toFixed(2)}%` : `亏吨率 ${rate.toFixed(2)}%`;
    const cls = rate > LOSS_THRESHOLD ? 'bad' : 'ok';
    return ` <span class="loss-rate ${cls}">到货 ${fmtTons(t.actualTons)}吨 · ${text}</span>`;
  }

  // ===== 工具 =====
  const pad = n => String(n).padStart(2, '0');
  const hhmm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hhmmss = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

  const els = {
    kpi: document.getElementById('kpi-grid'),
    channel: document.getElementById('channel-grid'),
    list: document.getElementById('trip-list'),
    lastUpdate: document.getElementById('last-update'),
    orderInput: document.getElementById('order-input'),
    orderBtn: document.getElementById('order-btn'),
    orderSuggestions: document.getElementById('order-suggestions'),
    orderBar: document.getElementById('order-bar'),
  };

  // ===== 渲染：KPI 总览 =====
  function renderKpi() {
    const trips = state.trips;
    const stat = key => {
      const list = trips.filter(t => t.mode === key);
      const running = list.filter(t => !isDone(t)).length;
      return { total: list.length, running, done: list.length - running };
    };
    const rail = stat('rail'), inter = stat('inter'), road = stat('road');
    const totalRunning = trips.filter(t => !isDone(t)).length;

    const cards = [
      { cls: '',       icon: ICONS.total, label: '总车次',   value: trips.length, trend: `在途 ${totalRunning} · 完毕 ${trips.length - totalRunning}` },
      { cls: 'blue',   icon: ICONS.rail,  label: '铁路直达', value: rail.total,   trend: `在途 ${rail.running} · 完毕 ${rail.done}` },
      { cls: 'purple', icon: ICONS.inter, label: '公铁联运', value: inter.total,  trend: `在途 ${inter.running} · 完毕 ${inter.done}` },
      { cls: 'orange', icon: ICONS.road,  label: '汽运直达', value: road.total,   trend: `在途 ${road.running} · 完毕 ${road.done}` },
    ];

    els.kpi.innerHTML = cards.map(c => `
      <div class="kpi-card ${c.cls}">
        <div class="kpi-icon ${c.cls}">${c.icon}</div>
        <div class="kpi-info">
          <div class="kpi-label">${c.label}</div>
          <div class="kpi-value">${c.value}<span class="kpi-unit">车次</span></div>
          <div class="kpi-trend">${c.trend}</div>
        </div>
      </div>`).join('');
  }

  // ===== 渲染：通道模式节点分布（各节点当前车次数，直观展示"到达哪一步"）=====
  function renderChannels() {
    const trips = state.trips;
    // 预设三种模式；存在自定义车次时追加自定义通道卡
    const keys = MODE_KEYS.slice();
    if (trips.some(t => t.mode === 'custom')) keys.push('custom');

    els.channel.innerHTML = keys.map(key => {
      const m = MODES[key];
      const list = trips.filter(t => t.mode === key);

      // 自定义通道：各车次节点链不同，按车次列出当前节点
      if (key === 'custom') {
        return `
          <div class="channel-card">
            <div class="channel-head">
              <span class="mode-badge custom">${m.name}</span>
              <span class="channel-count">${list.length} 车次</span>
            </div>
            <div class="custom-trip-list">
              ${list.map(t => `
                <div class="custom-trip">
                  <span>${esc(t.id)}</span>
                  <span class="cur">${esc(store.getNodes(t)[t.nodeIndex] || '-')}</span>
                </div>`).join('')}
            </div>
          </div>`;
      }

      // 按节点下标计数（公铁联运存在两个"到达"节点，须按下标而非名称统计）
      const counts = m.nodes.map((_, i) => list.filter(t => t.nodeIndex === i).length);
      return `
        <div class="channel-card">
          <div class="channel-head">
            <span class="mode-badge ${key}">${m.name}</span>
            <span class="channel-count">${list.length} 车次</span>
          </div>
          <div class="channel-nodes">
            ${m.nodes.map((n, i) => `
              <div class="node-chip ${counts[i] ? 'active' : ''}">
                <span class="node-name">${n}</span>
                <span class="node-count">${counts[i]}</span>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');
  }

  // ===== 渲染：车次实时进度列表 =====
  function tripItemHTML(t) {
    const done = isDone(t);
    // 订单号：已关联则显示可点击链接（点击即查询该订单），否则显示未关联
    const orderPart = t.orderId
      ? `<a class="order-link" data-order="${esc(t.orderId)}" title="点击查询该订单名下车次">订单 ${esc(t.orderId)}</a> · `
      : '<span class="order-none">未关联订单</span> · ';
    return `
      <div class="trip-item">
        <div class="trip-info">
          <div class="trip-id-row">
            <span class="trip-id">${esc(t.id)}</span>
            <span class="mode-badge ${t.mode}">${store.modeName(t)}</span>
            <span class="trip-status ${done ? 'done' : 'running'}">${done ? '已完成' : '进行中'}</span>
          </div>
          <div class="trip-meta">${orderPart}${esc(t.from)} → ${esc(t.to)} · ${esc(t.cargo)} ${t.tons}吨${lossPartHTML(t)}</div>
        </div>
        <div class="trip-stepper">${store.stepperHTML(t)}</div>
        <div class="trip-time">${hhmm(t.time)}</div>
      </div>`;
  }

  function renderList() {
    // 订单号查询优先：查询状态下显示该订单名下全部车次（忽略方式筛选）
    const q = orderQuery.trim().toUpperCase();
    const list = state.trips
      .filter(t => q ? (t.orderId || '').toUpperCase() === q : (filterMode === 'all' || t.mode === filterMode))
      .slice()
      // 进行中在前，节点越靠前越上，其余按更新时间倒序
      .sort((a, b) => (isDone(a) - isDone(b)) || (a.nodeIndex - b.nodeIndex) || (b.time - a.time));

    renderOrderBar(q, list);
    els.list.innerHTML = list.length
      ? list.map(tripItemHTML).join('')
      : '<div class="trip-empty">暂无车次</div>';
  }

  // 查询结果条：订单名下车次统计（含计划/到货总重量与亏吨率）+ 清除查询
  function renderOrderBar(q, list) {
    if (!q) {
      els.orderBar.hidden = true;
      els.orderBar.innerHTML = '';
      return;
    }
    const running = list.filter(t => !isDone(t)).length;

    // 重量统计：计划总重按全部车次；亏吨率按已到货车次计算
    const arrived = list.filter(t => t.actualTons != null);
    const plan = list.reduce((s, t) => s + (Number(t.tons) || 0), 0);
    const actual = arrived.reduce((s, t) => s + (Number(t.actualTons) || 0), 0);
    const arrivedPlan = arrived.reduce((s, t) => s + (Number(t.tons) || 0), 0);
    const rate = arrived.length ? (arrivedPlan - actual) / arrivedPlan * 100 : null;
    const rateText = rate == null ? '—'
      : rate < 0 ? `溢吨 ${Math.abs(rate).toFixed(2)}%` : `亏吨率 ${rate.toFixed(2)}%`;
    const rateCls = rate == null ? '' : rate > LOSS_THRESHOLD ? 'bad' : 'ok';

    els.orderBar.hidden = false;
    els.orderBar.innerHTML = `
      <span class="order-bar-label">订单 <b>${esc(q)}</b> 名下车次</span>
      <span class="order-bar-stat">共 ${list.length} 车次 · 在途 ${running} · 完毕 ${list.length - running}</span>
      <span class="order-bar-stat">计划总重 ${fmtTons(plan)}吨 · 到货 ${fmtTons(actual)}吨（${arrived.length}/${list.length} 车）· <span class="loss-rate ${rateCls}">${rateText}</span></span>
      <button type="button" class="order-bar-clear">清除查询</button>`;
  }

  // 订单号输入建议（现有车次的全部关联订单）
  function renderOrderSuggestions() {
    const ids = [...new Set(state.trips.map(t => (t.orderId || '').trim()).filter(Boolean))];
    els.orderSuggestions.innerHTML = ids.map(id => `<option value="${esc(id)}"></option>`).join('');
  }

  function renderAll() {
    renderKpi();
    renderChannels();
    renderOrderSuggestions();
    renderList();
    els.lastUpdate.textContent = hhmmss(Date.now());
  }

  // ===== 方式筛选 =====
  document.getElementById('filter-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    filterMode = btn.dataset.mode;
    document.querySelectorAll('#filter-tabs .tab')
      .forEach(b => b.classList.toggle('active', b === btn));
    renderList();
  });

  // ===== 订单号查询 =====
  function doOrderSearch() {
    orderQuery = els.orderInput.value.trim();
    renderList();
  }

  els.orderBtn.addEventListener('click', doOrderSearch);

  els.orderInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doOrderSearch();
    }
  });

  // 清除查询
  els.orderBar.addEventListener('click', e => {
    if (!e.target.closest('.order-bar-clear')) return;
    orderQuery = '';
    els.orderInput.value = '';
    renderList();
  });

  // 点击车次行内的订单号链接，直接查询该订单
  els.list.addEventListener('click', e => {
    const link = e.target.closest('.order-link');
    if (!link) return;
    orderQuery = link.dataset.order;
    els.orderInput.value = orderQuery;
    renderList();
  });

  // ===== 模拟新增车次（演示用；真实数据由信息录入页产生）=====
  function spawnTrip() {
    const modeKey = MODE_KEYS[Math.floor(Math.random() * MODE_KEYS.length)];
    const routes = ROUTES[modeKey];
    const [from, to] = routes[Math.floor(Math.random() * routes.length)];
    state.trips.push({
      id: store.nextId(state),
      mode: modeKey,
      from, to,
      cargo: CARGOS[Math.floor(Math.random() * CARGOS.length)],
      tons: modeKey === 'road' ? 20 + Math.floor(Math.random() * 20) : 800 + Math.floor(Math.random() * 2600),
      nodeIndex: 0,
      time: Date.now(),
    });
  }

  // ===== 实时模拟：定期推进车次节点（接入后端后可改为 WebSocket 推送）=====
  function tick() {
    // 重新加载共享数据，同步信息录入页的最新修改
    state = store.load();
    const trips = state.trips;

    // 随机推进 1~2 条在途车次；全部完成时必新增车次，保证看板始终有在途动态
    const running = trips.filter(t => !isDone(t));
    if (!running.length) {
      spawnTrip();
    } else {
      const push = Math.min(running.length, 1 + (Math.random() < 0.4 ? 1 : 0));
      for (let i = 0; i < push; i++) {
        const t = running.splice(Math.floor(Math.random() * running.length), 1)[0];
        t.nodeIndex += 1;
        t.time = Date.now();
      }
      // 偶尔新增车次，保持看板动态
      if (trips.length < 18 && Math.random() < 0.25) {
        spawnTrip();
      }
    }
    store.save(state);
    renderAll();
  }

  setInterval(tick, 3000);

  // 初始渲染
  renderAll();
})();
