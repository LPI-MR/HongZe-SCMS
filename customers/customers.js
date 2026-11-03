// ===== 客户管理统一库页面脚本 =====
// 依赖：common/fetch.js（导航栏）、customers/sync-engine.js（统一库只读接口）
// 职责：读取统一库、双视图切换、行业/来源/关键词筛选、分页、详情抽屉与溯源跳转
// 说明：本页对统一库只读；数据由 sync.html 的一次性同步脚本写入
(function () {
  'use strict';

  var S = window.HZCustomerSync;
  var NAV_PATH = '客户管理';

  /* ==================== 工具 ==================== */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  var toastTimer = null;
  function toast(msg, type) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  }

  // 数据来源 → 标签配色类（与 customers.css 中 s-* 变体一一对应）
  var SRC_CLASS = {
    '铁路供应商管理': 's-railway',
    '港口管理': 's-ports',
    '中转站点管理': 's-transfer',
    '仓储管理': 's-warehouse',
    '汽运车队管理': 's-fleet',
    '钢厂管理': 's-steel',
    '矿石贸易商名录': 's-trader'
  };
  function srcTag(label) {
    return '<span class="c-tag src ' + (SRC_CLASS[label] || '') + '">' + esc(label) + '</span>';
  }
  function roleTag(r) {
    return '<span class="c-tag role' + (r === S.VIEW_CUSTOMER_ROLE ? ' r-cust' : '') + '">' + esc(r) + '</span>';
  }
  function indTag(i) {
    return '<span class="c-tag ind">' + esc(i) + '</span>';
  }

  /* ==================== 导航选中态 ==================== */

  function setActiveNav() {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.querySelectorAll('.active').forEach(function (el) { el.classList.remove('active'); });
    var item = navbar.querySelector('[data-path="' + NAV_PATH + '"]');
    if (item) item.classList.add('active');
  }
  var navbar = document.getElementById('navbar');
  if (navbar && navbar.children.length) setActiveNav();
  else document.addEventListener('navbar:loaded', setActiveNav, { once: true });

  /* ==================== 状态 ==================== */

  var all = [];                 // 统一库全量主体
  var view = 'all';             // all | customer | resource
  var custType = 'all';         // 客户视图类型细分：all | steel | trader
  var kw = '';                  // 关键词
  var selIndustries = [];       // 选中的行业标签（多选，命中任一即可）
  var selSource = '';           // 选中的数据来源（单选）
  var page = 1;
  var pageSize = 10;

  /* ==================== 数据加载 ==================== */

  function load() {
    var w = S.readUnified();
    all = (w.list || []).slice();
    renderChips();
    renderSourceSelect();
    renderKpis();
    renderTable();
  }

  /* ==================== 视图归属判定（与引擎口径一致） ==================== */

  function isCustomer(e) {
    return (e.roles || []).indexOf(S.VIEW_CUSTOMER_ROLE) >= 0;
  }
  function isResource(e) {
    return (e.roles || []).some(function (r) { return S.VIEW_RESOURCE_ROLES.indexOf(r) >= 0; });
  }
  // 客户视图两类客户（角色定位均为我方付费客户，而非货物供应商）：钢铁企业、矿石贸易商
  // 贸易商按行业优先归类：两类主体均带付费客户角色，需防止贸易商被并入钢铁企业
  function isTrader(e) {
    return (e.industries || []).indexOf('矿石贸易商') >= 0;
  }
  function isSteel(e) {
    if (isTrader(e)) return false;
    return (e.industries || []).indexOf('钢铁生产企业') >= 0 || isCustomer(e);
  }
  function isCustomerViewEntity(e) {
    return isSteel(e) || isTrader(e);
  }

  /* ==================== 筛选 ==================== */

  function filtered() {
    var tokens = kw.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(function (e) {
      if (view === 'resource' && !isResource(e)) return false;
      if (view === 'customer') {
        if (!isCustomerViewEntity(e)) return false;
        if (custType === 'steel' && !isSteel(e)) return false;
        if (custType === 'trader' && !isTrader(e)) return false;
      }
      if (selIndustries.length) {
        var hit = (e.industries || []).some(function (i) { return selIndustries.indexOf(i) >= 0; });
        if (!hit) return false;
      }
      if (selSource && (e.sources || []).indexOf(selSource) < 0) return false;
      if (tokens.length) {
        var hay = [e.name, (e.profile && e.profile['企业简称']) || '', e.creditCode || '']
          .join(' ').toLowerCase();
        for (var i = 0; i < tokens.length; i++) {
          if (hay.indexOf(tokens[i]) < 0) return false;
        }
      }
      return true;
    });
  }

  /* ==================== 渲染：KPI / 徽标 / 筛选项 ==================== */

  function renderKpis() {
    var steel = all.filter(isSteel).length;
    var trader = all.filter(isTrader).length;
    var cust = all.filter(isCustomerViewEntity).length;
    var res = all.filter(isResource).length;
    var code = all.filter(function (e) { return !!e.creditCode; }).length;
    $('kpiTotal').textContent = all.length;
    $('kpiTotalNote').textContent = all.length
      ? '最近同步：' + fmtTime(all[0].synced_at || Date.now())
      : '—';
    $('kpiCust').textContent = cust;
    $('kpiSteel').textContent = steel;
    $('kpiTrader').textContent = trader;
    $('kpiRes').textContent = res;
    $('kpiCode').textContent = code;
    $('badgeAll').textContent = all.length;
    $('badgeCust').textContent = cust;
    $('badgeRes').textContent = res;
    $('typeBadgeAll').textContent = cust;
    $('typeBadgeSteel').textContent = steel;
    $('typeBadgeTrader').textContent = trader;
  }

  // 行业标签胶囊（含计数，多选筛选）
  function renderChips() {
    var indCount = {};
    all.forEach(function (e) {
      (e.industries || []).forEach(function (i) { indCount[i] = (indCount[i] || 0) + 1; });
    });
    var industries = S.INDUSTRIES_ALL.filter(function (i) { return indCount[i]; });

    var html = industries.map(function (i) {
      var act = selIndustries.indexOf(i) >= 0 ? ' active' : '';
      return '<button class="chip' + act + '" type="button" data-ind="' + esc(i) + '">' +
        esc(i) + ' <span class="chip-count">' + indCount[i] + '</span></button>';
    }).join('');
    $('industryChips').innerHTML = html;

    $('industryChips').querySelectorAll('.chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ind = btn.getAttribute('data-ind');
        var idx = selIndustries.indexOf(ind);
        if (idx >= 0) selIndustries.splice(idx, 1);
        else selIndustries.push(ind);
        btn.classList.toggle('active');
        page = 1;
        renderTable();
      });
    });
  }

  // 数据来源下拉（含计数）
  function renderSourceSelect() {
    var srcCount = {};
    all.forEach(function (e) {
      (e.sources || []).forEach(function (s) { srcCount[s] = (srcCount[s] || 0) + 1; });
    });
    var sel = $('sourceSelect');
    sel.innerHTML = '<option value="">全部来源</option>' + S.sources
      .filter(function (s) { return srcCount[s.label]; })
      .map(function (s) {
        return '<option value="' + esc(s.label) + '">' + esc(s.label) + '（' + srcCount[s.label] + '）</option>';
      }).join('');
    sel.value = selSource;
  }

  /* ==================== 渲染：列表 ==================== */

  function renderTable() {
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > pages) page = pages;
    var start = (page - 1) * pageSize;
    var rows = list.slice(start, start + pageSize);

    $('custCount').textContent = all.length;
    $('custHit').textContent = list.length;
    $('pagerTotal').textContent = list.length;
    $('pgPages').textContent = pages;
    $('pgInput').value = page;
    $('pgInput').max = pages;
    $('pgFirst').disabled = $('pgPrev').disabled = page <= 1;
    $('pgNext').disabled = $('pgLast').disabled = page >= pages;

    var tbody = $('custTbody');
    if (!list.length) {
      tbody.innerHTML = all.length
        ? '<tr class="empty-row"><td colspan="7">当前筛选条件下暂无数据，请调整筛选</td></tr>'
        : '<tr><td colspan="7">' + emptyGuide() + '</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (e, i) {
      var alias = (e.profile && e.profile['企业简称']) || '';
      return '<tr>' +
        '<td class="col-index">' + (start + i + 1) + '</td>' +
        '<td><div class="cust-name" data-id="' + esc(e.id) + '">' + esc(e.name) + '</div>' +
          (alias ? '<div class="cust-alias">' + esc(alias) + '</div>' : '') + '</td>' +
        '<td class="col-code">' + (e.creditCode ? esc(e.creditCode) : '<span style="color:var(--gray-400)">待补录</span>') + '</td>' +
        '<td class="col-roles"><div class="tag-row">' + (e.roles || []).map(roleTag).join('') + '</div></td>' +
        '<td class="col-industry"><div class="tag-row">' + (e.industries || []).map(indTag).join('') + '</div></td>' +
        '<td class="col-source"><div class="tag-row">' + (e.sources || []).map(srcTag).join('') + '</div></td>' +
        '<td class="col-op"><button class="btn btn-ghost btn-sm" data-detail="' + esc(e.id) + '" type="button">详情</button></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('.cust-name').forEach(function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-id')); });
    });
    tbody.querySelectorAll('[data-detail]').forEach(function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-detail')); });
    });
  }

  function emptyGuide() {
    return '<div class="empty-guide">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>' +
      '<path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>' +
      '<div class="eg-title">客户管理统一库暂无数据</div>' +
      '<div class="eg-desc">请前往「同步控制台」执行一次性数据同步，将六个存量模块的合规企业主体同步至本库</div>' +
      '<a class="btn btn-primary" href="/customers/sync.html">前往同步控制台</a>' +
      '</div>';
  }

  /* ==================== 详情抽屉 ==================== */

  function openDetail(id) {
    var e = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { e = all[i]; break; }
    }
    if (!e) return;

    $('drawerTitle').textContent = '主体详情 · ' + e.name;

    var html = '';

    // 基本信息
    html += '<div class="drawer-section"><div class="section-title">基本信息</div><div class="kv-grid">' +
      kvItem('企业名称', e.name) +
      kvItem('企业简称', (e.profile && e.profile['企业简称']) || '—') +
      kvItem('统一社会信用代码', e.creditCode || '待补录') +
      kvItem('同步批次', e.sync_batch || '—') +
      '</div></div>';

    // 标签体系
    html += '<div class="drawer-section"><div class="section-title">标签体系</div>' +
      '<div class="kv-grid">' +
      kvMulti('业务角色', (e.roles || []).map(roleTag).join('')) +
      kvMulti('行业标签', (e.industries || []).map(indTag).join('')) +
      kvMulti('数据来源', (e.sources || []).map(srcTag).join('')) +
      '</div></div>';

    // 补充信息（profile 其余字段）
    var extra = Object.keys(e.profile || {}).filter(function (k) {
      return k !== '企业简称' && e.profile[k];
    });
    if (extra.length) {
      html += '<div class="drawer-section"><div class="section-title">补充信息</div><div class="kv-grid">' +
        extra.map(function (k) { return kvItem(k, e.profile[k]); }).join('') +
        '</div></div>';
    }

    // 数据溯源（一键跳回老模块原始详情页）
    html += '<div class="drawer-section"><div class="section-title">数据溯源（' +
      (e.source_refs || []).length + ' 条映射）</div><div class="ref-list">' +
      (e.source_refs || []).map(function (r) {
        return '<div class="ref-item">' +
          '<div class="ref-info">' +
          '<div class="ref-name">' + srcTag(r.module_label) + ' ' + esc(r.source_name || r.source_id) + '</div>' +
          '<div class="ref-meta">提取途径：' + esc(r.via || '记录主体') + ' · 同步于 ' + fmtTime(r.synced_at || e.synced_at) + '</div>' +
          '</div>' +
          (r.detail_url
            ? '<a class="btn btn-ghost btn-sm" href="' + esc(r.detail_url) + '" target="_blank" rel="noopener">查看原始详情</a>'
            : '<span class="test-note">无链接</span>') +
          '</div>';
      }).join('') + '</div></div>';

    $('drawerBody').innerHTML = html;
    $('drawerMask').hidden = false;
  }

  function kvItem(label, value) {
    return '<div class="kv-item"><div class="kv-label">' + esc(label) + '</div>' +
      '<div class="kv-value">' + esc(value) + '</div></div>';
  }
  function kvMulti(label, tagHtml) {
    return '<div class="kv-item"><div class="kv-label">' + esc(label) + '</div>' +
      '<div class="kv-value"><div class="tag-row">' + (tagHtml || '—') + '</div></div></div>';
  }

  /* ==================== 事件绑定 ==================== */

  // 视图切换（类型细分控件仅客户视图内可见）
  $('viewTabs').querySelectorAll('.view-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      view = btn.getAttribute('data-view');
      $('viewTabs').querySelectorAll('.view-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      $('typeTabs').hidden = view !== 'customer';
      page = 1;
      renderTable();
    });
  });

  // 客户类型细分（钢铁企业 / 矿石贸易商，仅客户视图内生效）
  $('typeTabs').querySelectorAll('.view-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      custType = btn.getAttribute('data-type');
      $('typeTabs').querySelectorAll('.view-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      page = 1;
      renderTable();
    });
  });

  // 关键词检索（输入即筛）
  var kwTimer = null;
  $('searchKeyword').addEventListener('input', function () {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(function () {
      kw = $('searchKeyword').value;
      page = 1;
      renderTable();
    }, 200);
  });

  // 数据来源筛选
  $('sourceSelect').addEventListener('change', function () {
    selSource = this.value;
    page = 1;
    renderTable();
  });

  // 重置筛选
  $('btnReset').addEventListener('click', function () {
    kw = ''; selIndustries = []; selSource = ''; custType = 'all'; page = 1;
    $('searchKeyword').value = '';
    $('sourceSelect').value = '';
    $('industryChips').querySelectorAll('.chip').forEach(function (b) { b.classList.remove('active'); });
    $('typeTabs').querySelectorAll('.view-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === 'all');
    });
    renderTable();
  });

  // 刷新数据（同步控制台执行完成后回到本页可一键刷新）
  $('btnRefresh').addEventListener('click', function () {
    load();
    toast('统一库数据已刷新：共 ' + all.length + ' 家主体', 'success');
  });

  // 分页
  $('pageSize').addEventListener('change', function () {
    pageSize = parseInt(this.value, 10) || 10;
    page = 1;
    renderTable();
  });
  $('pgFirst').addEventListener('click', function () { page = 1; renderTable(); });
  $('pgPrev').addEventListener('click', function () { page--; renderTable(); });
  $('pgNext').addEventListener('click', function () { page++; renderTable(); });
  $('pgLast').addEventListener('click', function () { page = Math.max(1, Math.ceil(filtered().length / pageSize)); renderTable(); });
  $('pgInput').addEventListener('change', function () {
    var p = parseInt(this.value, 10);
    if (isNaN(p)) { renderTable(); return; }
    page = Math.min(Math.max(1, p), Math.max(1, Math.ceil(filtered().length / pageSize)));
    renderTable();
  });

  // 抽屉关闭
  $('drawerClose').addEventListener('click', function () { $('drawerMask').hidden = true; });
  $('drawerMask').addEventListener('click', function (e) {
    if (e.target === $('drawerMask')) $('drawerMask').hidden = true;
  });

  /* ==================== 初始化 ==================== */

  load();
})();
