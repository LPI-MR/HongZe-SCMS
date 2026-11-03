// ===== 执行跟踪模块脚本 =====
// 只读聚合页：不新建数据，以进度卡片流呈现订单关联的航次与车次执行进度
// 订单 / 流转日志走共享数据层（business-data.js）；车次节点进度走 TripsStore（trips-store.js）
// 航次跨模块字段统一经 HZData 数据基座（hz-data.js）调取海运模块权威数据源，
// 后端就绪后仅需在 HZData 注册对应模块适配器，本页业务代码无需改动
(function () {
  'use strict';

  // 本页对应的导航位置：业务管理 → 执行跟踪
  const NAV_PATH = '业务管理';
  const NAV_SUB = NAV_PATH + ' / 执行跟踪';

  // 设置导航栏选中态：一级「业务管理」高亮并展开，二级「执行跟踪」高亮
  function setActiveNav() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    navbar.querySelectorAll('.nav-item.active, .nav-sub-item.active')
      .forEach(el => el.classList.remove('active'));

    navbar.querySelectorAll('.nav-item').forEach(item => {
      const label = item.querySelector('.label');
      const path = item.dataset.path || (label ? label.textContent.trim() : '');
      if (path !== NAV_PATH) return;

      item.classList.add('active');

      const group = item.closest('.nav-group');
      if (group) {
        group.classList.add('open');
        group.querySelectorAll('.nav-sub-item').forEach(sub => {
          if ((sub.dataset.path || '') === NAV_SUB) sub.classList.add('active');
        });
      }
    });
  }

  // 导航栏为异步加载：已加载则直接设置，否则等待 navbar:loaded 事件
  const navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) {
    setActiveNav();
  } else {
    document.addEventListener('navbar:loaded', setActiveNav, { once: true });
  }

  // ===== 数据对接 =====
  const biz = window.HZBusinessData;
  const store = window.TripsStore;
  const hz = window.HZData;

  // 模块化数据调取：跨模块字段统一经 HZData 数据基座 raw(模块键) 读取权威数据源
  const rawArr = key => ((hz && typeof hz.raw === 'function' ? hz.raw(key) : null) || []);

  // 订单列表：[{id, order_code, contract_id, contract_code, mine_id, mine_name,
  //   voyage_id, trip_ids, customer, cargo_name, cargo_qty, amount, sign_date,
  //   plan_end_date, status, remark, created_by, created_at, updated_at}]
  let orders = biz.loadOrders();

  // 航次：oceanTrips 模块（海运管理）权威数据，按 id 索引回填航次号与执行进度
  const voyages = rawArr('oceanTrips');
  const voyageById = {};
  voyages.forEach(v => { voyageById[v.id] = v; });

  // 车次：hz-scms-trips-v2 包装 { seq, trips }（TripsStore 维护），按 id 索引
  // 注意：车次的 orderId 为运输模块自有单号，与业务订单 id 不对应，关联一律走 order.trip_ids
  const tripById = {};
  ((store.load() || {}).trips || []).forEach(t => { tripById[t.id] = t; });

  // 下游页面跳转路径（与 common/fetch.js NAV_ROUTES 保持一致）
  const OCEAN_PAGE = '/ocean/ocean.html';
  const TRANSPORT_PAGE = '/transport/transport.html';

  // 订单状态标签类名映射（business.css 状态标签变体）
  const STATUS_CLS = {
    '待确认': 'pending',
    '已确认': 'confirmed',
    '执行中': 'running',
    '已发运': 'shipped',
    '已完成': 'done',
    '已终止': 'terminated'
  };

  // 航次状态映射：类名 + 中文文案（对齐 ocean 模块 STATUS 与 business.css 航次变体）
  const VOYAGE_STATUS = {
    pending: { text: '待装船', cls: 'pending' },
    loading: { text: '装船中', cls: 'loading' },
    sailing: { text: '在途', cls: 'sailing' },
    arrived: { text: '已到港', cls: 'arrived' },
    done: { text: '已完成', cls: 'done' }
  };

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 货量格式化：千分位，最多两位小数
  function fmtQty(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }

  // 日期格式化：时间戳 → YYYY-MM-DD
  function fmtDate(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function statusTag(status) {
    return '<span class="status-tag ' + esc(STATUS_CLS[status] || '') + '">' + esc(status) + '</span>';
  }

  // 航次状态标签：未识别状态原样显示
  function voyageTag(status) {
    const v = VOYAGE_STATUS[status];
    return '<span class="status-tag ' + esc(v ? v.cls : '') + '">' + esc(v ? v.text : (status || '—')) + '</span>';
  }

  // 订单关联车次：一律按 order.trip_ids 取车次（车次自身 orderId 与业务订单不对应）
  function tripsOf(o) {
    return (Array.isArray(o.trip_ids) ? o.trip_ids : [])
      .map(id => tripById[id])
      .filter(Boolean);
  }

  // 关联车次完成进度文案：如「3 车 · 1/3」；无关联车次显示 —
  function tripProgressText(o) {
    const trips = tripsOf(o);
    if (!trips.length) return '—';
    const done = trips.filter(t => store.isDone(t)).length;
    return trips.length + ' 车 · ' + done + '/' + trips.length;
  }

  // ===== 跟踪检索 =====
  // 卡片约定：track-list 中每条订单为一张进度卡片，携带 data-* 属性——
  //   data-id（唯一标识）、data-status、data-date（签订日期 YYYY-MM-DD）
  // 空状态提示使用 #trackEmpty，不参与过滤
  let applyFilter = null;

  function initSearch() {
    const form = document.getElementById('searchForm');
    if (!form) return;

    const nameInput = document.getElementById('searchKeyword');
    const statusSelect = document.getElementById('searchStatus');
    const startInput = document.getElementById('searchDateStart');
    const endInput = document.getElementById('searchDateEnd');

    // 按当前检索条件过滤进度卡片；无匹配时显示空状态提示
    applyFilter = function () {
      const status = statusSelect.value;
      const start = startInput.value;
      const end = endInput.value;
      // 关键词检索：空格分隔多个词，全部命中（AND）才算匹配，不限字段模糊匹配
      const keywords = (nameInput.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);

      let visible = 0;
      trackList.querySelectorAll('.track-card').forEach(card => {
        const date = card.dataset.date || '';
        // 卡片全文 = 文本内容 + data 属性，作为关键词匹配范围
        const text = card.textContent.toLowerCase() +
          ' ' + Object.values(card.dataset).join(' ').toLowerCase();
        const ok =
          keywords.every(kw => text.includes(kw)) &&
          (!status || card.dataset.status === status) &&
          (!start || (date && date >= start)) &&
          (!end || (date && date <= end));

        card.hidden = !ok;
        if (ok) visible += 1;
      });

      // 无匹配（或本无数据）时显示空状态提示
      const emptyTip = document.getElementById('trackEmpty');
      if (emptyTip) emptyTip.hidden = visible > 0;

      renderPage();
    };

    // 关键词输入 / 状态切换 / 日期变更即筛（免点击查询按钮）
    nameInput.addEventListener('input', () => applyFilter());
    statusSelect.addEventListener('change', () => applyFilter());
    startInput.addEventListener('change', () => applyFilter());
    endInput.addEventListener('change', () => applyFilter());

    // 提交：阻止表单默认提交（保留回车触发过滤）
    form.addEventListener('submit', e => {
      e.preventDefault();
      applyFilter();
    });

    // 重置：清空条件后恢复显示全部卡片
    form.addEventListener('reset', () => {
      // 等浏览器完成原生 reset 后再过滤
      requestAnimationFrame(() => applyFilter());
    });
  }

  // ===== 跟踪列表：数据驱动渲染（进度卡片流） =====
  const trackList = document.getElementById('trackList');

  // 按当前 DOM 顺序重排
  function renumber() {
    let i = 0;
    trackList.querySelectorAll('.track-card').forEach(card => {
      card.querySelector('.track-idx').textContent = ++i;
    });
  }

  // ----- 分页（基于检索后的可见卡片切片显示） -----
  let pageSize = 10;   // 每页条数
  let curPage = 1;     // 当前页码

  function renderPage() {
    const $ = id => document.getElementById(id);
    // 只对「检索后可见」的进度卡片分页（空状态提示不参与）
    const cards = Array.from(trackList.querySelectorAll('.track-card')).filter(c => !c.hidden);

    const total = cards.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > pages) curPage = pages;
    if (curPage < 1) curPage = 1;

    const start = (curPage - 1) * pageSize;
    cards.forEach((c, i) => {
      c.hidden = i < start || i >= start + pageSize;
    });

    // 同步分页控件状态
    $('pagerTotal').textContent = total;
    $('pgPages').textContent = pages;
    $('pgInput').value = curPage;
    $('pgInput').max = pages;
    $('pgFirst').disabled = curPage <= 1;
    $('pgPrev').disabled = curPage <= 1;
    $('pgNext').disabled = curPage >= pages;
    $('pgLast').disabled = curPage >= pages;
  }

  function bindPager() {
    const $ = id => document.getElementById(id);
    const pages = () => Math.max(1, Number($('pgPages').textContent) || 1);
    const go = p => { curPage = p; renderPage(); };

    $('pgFirst').addEventListener('click', () => go(1));
    $('pgPrev').addEventListener('click', () => go(curPage - 1));
    $('pgNext').addEventListener('click', () => go(curPage + 1));
    $('pgLast').addEventListener('click', () => go(pages()));

    // 每页条数切换：回到第 1 页
    $('pageSize').addEventListener('change', e => {
      pageSize = Number(e.target.value) || 10;
      curPage = 1;
      renderPage();
    });

    // 页码输入跳转：change 或回车触发，越界自动纠正
    const jump = () => {
      let p = parseInt($('pgInput').value, 10);
      if (isNaN(p)) p = curPage;
      go(Math.min(Math.max(p, 1), pages()));
    };
    $('pgInput').addEventListener('change', jump);
    $('pgInput').addEventListener('keydown', e => { if (e.key === 'Enter') jump(); });
  }

  // ----- 统计：列表小标题 + 概览条（数据来源：orders 数组） -----
  function updateStats() {
    let track = 0;       // 跟踪订单数（不含已终止）
    let running = 0;     // 执行中订单数（执行中 / 已发运）
    let arrived = 0;     // 已到港订单数（关联航次状态为已到港）
    let monthDone = 0;   // 本月完成订单数（本月更新为已完成）
    const now = new Date();

    orders.forEach(o => {
      if (o.status !== biz.ORDER_TERMINAL) {
        track += 1;
        if (o.status === '执行中' || o.status === '已发运') running += 1;
        const v = o.voyage_id ? voyageById[o.voyage_id] : null;
        if (v && v.status === 'arrived') arrived += 1;
      }
      if (o.status === '已完成') {
        const d = new Date(o.updated_at || o.created_at || 0);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) monthDone += 1;
      }
    });

    document.getElementById('trackCount').textContent = track;
    document.getElementById('tTrack').textContent = track;
    document.getElementById('tRunning').textContent = running;
    document.getElementById('tArrived').textContent = arrived;
    document.getElementById('tMonthDone').textContent = monthDone;

    // 概览条：执行中占比（执行中订单 / 跟踪订单，不含已终止）
    const rate = track ? Math.round(running / track * 100) : 0;
    const runBar = document.getElementById('ovRunBar');
    if (runBar) runBar.style.width = Math.min(rate, 100) + '%';
    const runRateEl = document.getElementById('ovRunRate');
    if (runRateEl) runRateEl.textContent = rate + '%';

    renderPage();
  }

  // 空状态提示显示/隐藏
  function toggleEmptyRow() {
    const emptyTip = document.getElementById('trackEmpty');
    const hasData = trackList.querySelectorAll('.track-card').length > 0;
    if (emptyTip) emptyTip.hidden = hasData;
  }

  // 由订单数据对象构造进度卡片（序号由 renumber 按位置统一编号）
  function renderCard(o) {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.id = o.id;
    card.dataset.order_code = o.order_code;
    card.dataset.customer = o.customer;
    card.dataset.cargo = o.cargo_name;
    card.dataset.status = o.status;
    card.dataset.date = o.sign_date || '';

    const v = o.voyage_id ? voyageById[o.voyage_id] : null;
    const trips = tripsOf(o);
    const doneTrips = trips.filter(t => store.isDone(t)).length;
    const pct = trips.length ? Math.round(doneTrips / trips.length * 100) : 0;

    card.innerHTML =
      '<div class="track-top">' +
        '<span class="track-idx"></span>' +
        '<span class="track-code">' + esc(o.order_code) + '</span>' +
        statusTag(o.status) +
        '<span class="track-spacer"></span>' +
        '<a class="detail-link" href="javascript:void(0)">详情</a>' +
      '</div>' +
      '<div class="track-meta">' +
        '<span>客户 <b>' + esc(o.customer || '—') + '</b></span>' +
        '<span>货物 <b>' + esc(o.cargo_name || '—') + '</b></span>' +
        '<span>合同 <b>' + esc(o.contract_code || '—') + '</b></span>' +
        '<span>签订 <b>' + esc(o.sign_date || '—') + '</b></span>' +
      '</div>' +
      '<div class="track-progress">' +
        '<div class="track-cell">' +
          '<span class="track-plabel">海运航次</span>' +
          '<span class="track-vval">' + (v ? esc(v.voyage_code || '') + ' ' + voyageTag(v.status) : '—') + '</span>' +
        '</div>' +
        '<div class="track-cell">' +
          '<span class="track-plabel">车次进度</span>' +
          '<span class="track-bar-row">' +
            '<span class="track-bar"><i style="width:' + pct + '%"></i></span>' +
            '<span class="track-pct">' + esc(tripProgressText(o)) + '</span>' +
          '</span>' +
        '</div>' +
      '</div>';
    return card;
  }

  // 按当前数据全量重建进度卡片流（订单台账变更后本页刷新即恢复最新数据）
  function renderAll() {
    trackList.querySelectorAll('.track-card').forEach(card => card.remove());
    orders.forEach(o => trackList.appendChild(renderCard(o)));
    renumber();
    updateStats();
    toggleEmptyRow();
    if (applyFilter) applyFilter();
  }

  // ===== 跟踪详情抽屉（只读，内容动态渲染） =====
  let currentId = null; // 当前抽屉对应的订单 id

  function showDrawer(title, html) {
    currentId = null;
    document.getElementById('drawerTitle').textContent = title;
    const body = document.getElementById('drawerBody');
    body.innerHTML = html;
    body.scrollTop = 0; // 二次打开重置滚动
    document.getElementById('drawerMask').hidden = false;
  }

  function closeDrawer() {
    document.getElementById('drawerMask').hidden = true;
    currentId = null;
  }

  function byId(id) {
    return orders.find(o => o.id === id) || null;
  }

  // 跟踪详情抽屉：基本信息 + 关联航次 + 车次节点进度 + 操作日志（四段只读聚合）
  function openDetailDrawer(id) {
    const o = byId(id);
    if (!o) return;
    currentId = id;

    const trips = tripsOf(o);

    // 基本信息
    const info = [
      ['订单编号', esc(o.order_code)],
      ['订单状态', statusTag(o.status)],
      ['合同编号', esc(o.contract_code || '—')],
      ['客户', esc(o.customer || '—')],
      ['货物名称', esc(o.cargo_name || '—')],
      ['货量（吨）', fmtQty(o.cargo_qty)],
      ['订单金额（元）', Number(o.amount || 0).toLocaleString('zh-CN', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      })],
      ['货源矿山', esc(o.mine_name || '—')],
      ['关联车次', trips.length ? esc(trips.map(t => t.id).join('、')) : '—'],
      ['签订日期', esc(o.sign_date || '—')],
      ['计划完成日期', esc(o.plan_end_date || '—')],
      ['备注', esc(o.remark || '—')]
    ].map(item =>
      '<div class="info-item span2">' +
        '<span class="info-label">' + item[0] + '</span>' +
        '<span class="info-value">' + item[1] + '</span>' +
      '</div>'
    ).join('');

    // 关联航次执行时间线：启航 → 到港（ETA）+ 当前状态（读航次 sail_date / eta_date / status）
    const v = o.voyage_id ? voyageById[o.voyage_id] : null;
    const voyageHtml = v
      ? '<div class="timeline">' +
          '<div class="timeline-item done">' +
            '<div class="timeline-dot"></div>' +
            '<div class="timeline-body">' +
              '<div class="timeline-title">' + esc(v.voyage_code || '') + ' · 海运航次</div>' +
              '<div class="timeline-time">' + esc(v.sail_date || '—') + ' 启航 → ' + esc(v.eta_date || '—') + ' 到港（ETA）</div>' +
              '<div class="timeline-desc">当前状态：' + voyageTag(v.status) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      : '<div class="form-tip muted">该订单暂未关联航次</div>';

    // 车次节点进度：每个关联车次一段（车次号 + 通道 + 节点进度条）
    const tripsSection = trips.length
      ? trips.map(t =>
          '<div class="drawer-section">' +
            '<div class="section-title">车次进度 · ' + esc(t.id) + '（' + esc(store.modeName(t)) + '）</div>' +
            '<div class="trip-stepper">' + store.stepperHTML(t) + '</div>' +
          '</div>'
        ).join('')
      : '<div class="drawer-section">' +
          '<div class="section-title">车次进度</div>' +
          '<div class="form-tip muted">该订单暂未关联车次</div>' +
        '</div>';

    // 操作日志：取该订单日志（最新在前），时间线呈现
    const logs = biz.loadLogs().filter(l => l.order_id === id);
    const logsHtml = logs.length
      ? '<div class="timeline">' + logs.map(l =>
          '<div class="timeline-item done">' +
            '<div class="timeline-dot"></div>' +
            '<div class="timeline-body">' +
              '<div class="timeline-title">' +
                (l.from_status ? esc(l.from_status) + ' → ' + esc(l.to_status) : '创建订单（' + esc(l.to_status) + '）') +
              '</div>' +
              '<div class="timeline-time">' + esc(fmtDate(l.time)) + ' · ' + esc(l.operator || '—') + '</div>' +
              (l.remark ? '<div class="timeline-desc">' + esc(l.remark) + '</div>' : '') +
            '</div>' +
          '</div>'
        ).join('') + '</div>'
      : '<div class="form-tip muted">暂无操作日志</div>';

    const html =
      '<div class="drawer-section">' +
        '<div class="section-title">基本信息</div>' +
        '<div class="info-grid">' + info + '</div>' +
      '</div>' +
      '<div class="drawer-section">' +
        '<div class="section-title">关联航次</div>' +
        voyageHtml +
      '</div>' +
      tripsSection +
      '<div class="drawer-section">' +
        '<div class="section-title">操作日志</div>' +
        logsHtml +
      '</div>' +
      '<div class="drawer-actions">' +
        (v ? '<button class="btn btn-ghost" type="button" data-act="goto-ocean">前往海运管理</button>' : '') +
        (trips.length ? '<button class="btn btn-ghost" type="button" data-act="goto-trips">前往运输调度</button>' : '') +
        '<button class="btn btn-ghost" type="button" data-act="close">关闭</button>' +
      '</div>';

    showDrawer('跟踪详情 · ' + (o.order_code || ''), html);
  }

  // ===== 抽屉基础事件：关闭 / 跳转 / 动态按钮（事件委托） =====
  function initDrawer() {
    const mask = document.getElementById('drawerMask');
    if (!mask) return;

    // 关闭：右上角 × / 点击遮罩空白处 / ESC 键
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    mask.addEventListener('click', e => {
      if (e.target === mask) closeDrawer();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !mask.hidden) closeDrawer();
    });

    // 动态渲染的按钮：关闭 / 前往海运管理 / 前往运输调度（事件委托）
    mask.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;

      if (btn.dataset.act === 'close') {
        closeDrawer();
      } else if (btn.dataset.act === 'goto-ocean') {
        location.href = OCEAN_PAGE;
      } else if (btn.dataset.act === 'goto-trips') {
        location.href = TRANSPORT_PAGE;
      }
    });
  }

  // ===== 卡片操作：详情（事件委托） =====
  function initTableActions() {
    trackList.addEventListener('click', e => {
      const card = e.target.closest('.track-card[data-id]');
      if (!card) return;

      if (e.target.closest('.detail-link')) {
        openDetailDrawer(card.dataset.id);
      }
    });
  }

  // ===== 初始化 =====
  initSearch();
  initTableActions();
  initDrawer();
  bindPager();
  renderAll(); // 启动时从 localStorage 恢复订单数据并聚合进度
})();
