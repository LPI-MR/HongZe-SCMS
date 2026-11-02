// ===== orders-flow 模块脚本（订单台账 · 履约流程视图）=====
// 承接自业务总览（business.html）的订单列表板块：检索 / 状态筛选 / 排序 / 详情直达 / 删除。
// 数据源为 flow-data.js（hz_flow_* 键空间），与「业务订单」视图（orders.js，hz_orders）互不影响。
(function () {
  'use strict';

  const data = window.HZFlowData;
  const $ = id => document.getElementById(id);
  const els = {
    switch: $('viewSwitch'),
    biz: $('view-biz'),
    flow: $('view-flow'),
    stats: $('fvStats'),
    sub: $('fvSub'),
    search: $('fvSearch'),
    filterSeg: $('fvFilterSeg'),
    sortGroup: $('fvSortGroup'),
    body: $('fvBody'),
    toast: $('fvToast'),
  };

  /* ==================== 视图切换 ==================== */

  // 初始视图由 URL 决定：?view=flow → 履约流程，否则业务订单
  let activeView = new URLSearchParams(location.search).get('view') === 'flow' ? 'flow' : 'biz';

  function applyView() {
    const isFlow = activeView === 'flow';
    els.biz.hidden = isFlow;
    els.flow.hidden = !isFlow;
    els.switch.querySelectorAll('.seg-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.view === activeView)
    );
    if (isFlow) render(); // 首次进入 / 切回时刷新数据
  }

  els.switch.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn || btn.dataset.view === activeView) return;
    activeView = btn.dataset.view;
    applyView();
    // 同步 URL（不产生历史记录），保证刷新 / 分享后视图一致
    history.replaceState(null, '', activeView === 'flow' ? '?view=flow' : location.pathname);
  });

  /* ==================== 列表状态（迁移自原业务总览 workbench） ==================== */

  let query = '';
  let statusFilter = 'all';
  let sortKey = 'createdAt';
  let sortDesc = true;

  // 状态筛选选项（按阶段分组）
  const FILTER_OPTIONS = [
    { key: 'all', label: '全部' },
    { key: 'create', label: '创建中' },
    { key: 'business', label: '业务流转' },
    { key: 'final', label: '已完成' },
  ];

  // 排序选项（同键再次点击切换方向）
  const SORT_OPTIONS = [
    { key: 'createdAt', label: '创建时间' },
    { key: 'id', label: '订单编号' },
    { key: 'cargoTotal', label: '货量' },
    { key: 'status', label: '状态' },
  ];

  let toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('error', type === 'error');
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  // ===== 数字摘要条（纯排版，无卡片） =====
  function renderStats(orders) {
    const createPhase = orders.filter(o => {
      const s = data.migrateStatus(o.status);
      return s && data.STATUS_META[s].phase === 'create';
    }).length;
    const businessPhase = orders.filter(o => {
      const s = data.migrateStatus(o.status);
      return s && data.STATUS_META[s].phase === 'business';
    }).length;
    const totalTons = orders.reduce((s, o) => s + (Number(o.cargoTotal) || 0), 0);

    els.stats.innerHTML =
      '<div class="fv-stat"><span class="fv-stat-num">' + orders.length + '</span><span class="fv-stat-label">订单总数</span></div>' +
      '<div class="fv-stat"><span class="fv-stat-num" style="color:#0071e3">' + createPhase + '</span><span class="fv-stat-label">创建中</span></div>' +
      '<div class="fv-stat"><span class="fv-stat-num" style="color:#ff9500">' + businessPhase + '</span><span class="fv-stat-label">业务流转</span></div>' +
      '<div class="fv-stat"><span class="fv-stat-num" style="color:#af52de">' + data.fmtNum(totalTons) + '<i class="fv-stat-unit">吨</i></span><span class="fv-stat-label">货物总量</span></div>';
  }

  // ===== 过滤 + 排序（逻辑与原业务总览一致） =====
  function filteredOrders(orders) {
    let list = orders.slice();
    // 状态筛选
    if (statusFilter !== 'all') {
      list = list.filter(o => {
        const s = data.migrateStatus(o.status);
        if (!s) return false;
        return data.STATUS_META[s].phase === statusFilter || (statusFilter === 'final' && s === 'completed');
      });
    }
    // 关键词搜索：订单号 / 客户 / 货物 / 终端客户 / 到港
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(o =>
        (o.id || '').toLowerCase().indexOf(q) !== -1 ||
        (o.trader || '').toLowerCase().indexOf(q) !== -1 ||
        (o.cargoName || '').toLowerCase().indexOf(q) !== -1 ||
        data.customersDisplay(o.customers).toLowerCase().indexOf(q) !== -1 ||
        (o.destPort || '').toLowerCase().indexOf(q) !== -1
      );
    }
    // 排序
    list.sort((a, b) => {
      let cmp = 0;
      const sa = data.migrateStatus(a.status);
      const sb = data.migrateStatus(b.status);
      if (sortKey === 'createdAt') {
        cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      } else if (sortKey === 'id') {
        cmp = String(a.id).localeCompare(String(b.id));
      } else if (sortKey === 'cargoTotal') {
        cmp = (Number(a.cargoTotal) || 0) - (Number(b.cargoTotal) || 0);
      } else if (sortKey === 'status') {
        const ia = sa ? data.STATUS_ORDER.indexOf(sa) : 0;
        const ib = sb ? data.STATUS_ORDER.indexOf(sb) : 0;
        cmp = ia - ib;
      }
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }

  // ===== 运输通道类型摘要 =====
  function channelSummary(orderId) {
    const caps = data.listCapacities(orderId);
    if (!caps.length) return '—';
    const names = { rail_direct: '铁路直达', rail_caozhuang: '公铁联运', rail_xingtai: '公铁联运', rail_transit: '公铁联运', road: '公路直达' };
    const types = [];
    caps.forEach(c => {
      const n = names[c.channelType] || c.channelType;
      if (types.indexOf(n) === -1) types.push(n);
    });
    return types.join(' · ');
  }

  // ===== 删除订单（confirm 后级联删除） =====
  function handleDelete(id) {
    if (confirm('确认删除订单 ' + id + ' 及其所有关联数据？此操作不可撤销。')) {
      data.deleteOrder(id);
      toast('订单 ' + id + ' 已删除');
      render();
    }
  }

  // ===== 表格行渲染（台账行式，替代原卡片） =====
  function renderRows(orders) {
    if (!orders.length) {
      els.body.innerHTML =
        '<tr class="empty-row"><td colspan="9">未匹配到订单，尝试更换筛选条件或关键词</td></tr>';
      return;
    }
    els.body.innerHTML = orders.map(o => {
      const s = data.migrateStatus(o.status) || 'draft';
      const meta = data.STATUS_META[s];
      return '<tr>' +
        '<td><a class="fv-no" href="flow/order-detail.html?id=' + encodeURIComponent(o.id) + '">' + data.esc(o.id) + '</a></td>' +
        '<td>' + data.esc(o.trader || '—') + '</td>' +
        '<td>' + data.esc(o.cargoName || '—') + '</td>' +
        '<td class="col-num">' + data.fmtNum(o.cargoTotal) + '</td>' +
        '<td>' + data.esc(o.destPort || '—') + '</td>' +
        '<td>' + data.esc(channelSummary(o.id)) + '</td>' +
        '<td><span class="fv-badge" style="color:' + meta.color + ';background:' + meta.bg + '">' + data.esc(meta.label) + '</span></td>' +
        '<td class="col-date">' + data.fmtDateShort(o.createdAt) + '</td>' +
        '<td class="col-action"><div class="cell-actions">' +
          '<button type="button" class="row-act detail" data-view="' + data.esc(o.id) + '">详情</button>' +
          '<button type="button" class="row-act del" data-del="' + data.esc(o.id) + '">删除</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  // ===== 全量渲染 =====
  function render() {
    const orders = data.listOrders();
    renderStats(orders);

    if (!orders.length) {
      els.sub.textContent = '共 0 个订单';
      els.body.innerHTML =
        '<tr class="empty-row"><td colspan="9">还没有订单，可从「业务总览」快捷新建</td></tr>';
      return;
    }

    const list = filteredOrders(orders);
    els.sub.textContent = '共 ' + orders.length + ' 个订单 · 匹配 ' + list.length + ' 个';
    renderRows(list);
  }

  // ===== 工具栏渲染 =====
  function renderToolbar() {
    els.filterSeg.innerHTML = FILTER_OPTIONS.map(opt =>
      '<button type="button" class="seg-btn' + (statusFilter === opt.key ? ' active' : '') + '" data-filter="' + opt.key + '">' + opt.label + '</button>'
    ).join('');

    els.sortGroup.innerHTML = SORT_OPTIONS.map(opt => {
      const active = sortKey === opt.key;
      const dir = active ? '<span class="dir">' + (sortDesc ? '↓' : '↑') + '</span>' : '';
      return '<button type="button" class="sort-btn' + (active ? ' active' : '') + '" data-sort="' + opt.key + '">' + opt.label + dir + '</button>';
    }).join('');
  }

  // ===== 事件绑定 =====
  els.search.addEventListener('input', e => {
    query = e.target.value;
    render();
  });

  els.filterSeg.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    statusFilter = btn.dataset.filter;
    renderToolbar();
    render();
  });

  els.sortGroup.addEventListener('click', e => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    const key = btn.dataset.sort;
    if (sortKey === key) {
      sortDesc = !sortDesc;
    } else {
      sortKey = key;
      sortDesc = true;
    }
    renderToolbar();
    render();
  });

  els.body.addEventListener('click', e => {
    const view = e.target.closest('[data-view]');
    if (view) {
      location.href = 'flow/order-detail.html?id=' + encodeURIComponent(view.dataset.view);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) handleDelete(del.dataset.del);
  });

  // ===== 初始化（先备好工具栏，再按 URL 决定初始视图） =====
  renderToolbar();
  applyView();
})();
