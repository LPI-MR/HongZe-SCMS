/* ============================================================
   客户管理模块 · 运营端管理页逻辑（新版三类客户模型）
   ------------------------------------------------------------
   功能（依据《PRD-客户管理模块》）：
   - F1 客户列表：类型 Tab + 搜索（名称/信用代码）+ 状态筛选 + 分页 + 操作列
   - F2 客户详情：白名单字段 + 资质凭证 + 状态变更记录
   - F3 平台代注册：类型仅集采贸易商 / 下游客户，保存即生效
   - F5 注册审核：通过 / 驳回（原因必填）
   - F6 编辑：联系人、联系方式（名称/类型/来源/非空信用代码锁定）
   - F7 停用 / 启用：二次确认
   - 数据迁移：统一库一次性迁移 + 矿石贸易商人工归类面板
   权限（4.2，TBD-01 降级）：登录体系未接入，本页以运营端身份兜底。
   ============================================================ */

(function () {
  'use strict';

  var D = window.HZCustomerData;

  /* ==================== 视图状态 ==================== */

  var state = {
    type: '全部',
    status: '全部',
    keyword: '',
    page: 1,
    pageSize: 10
  };

  // 弹窗上下文
  var ctx = {
    createType: '集采贸易商',
    reviewId: null,
    reviewDecision: 'approve',
    confirmId: null,
    confirmTarget: '停用',
    editId: null,
    currentDetail: null
  };

  /* ==================== 基础工具 ==================== */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var toastTimer = null;
  function toast(msg, type) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast ' + (type || ''); }, 2600);
  }

  function openMask(id) { var m = $(id); m.hidden = false; requestAnimationFrame(function () { m.classList.add('show'); }); }
  function closeMask(id) {
    var m = $(id);
    m.classList.remove('show');
    setTimeout(function () { m.hidden = true; }, 200);
  }

  function clearErrors(scopeEl) {
    scopeEl.querySelectorAll('.req-err').forEach(function (el) { el.textContent = ''; });
  }

  function showErrors(scopeEl, errors) {
    Object.keys(errors || {}).forEach(function (k) {
      var el = scopeEl.querySelector('[data-err="' + k + '"]');
      if (el) el.textContent = errors[k];
    });
  }

  function firstError(errors) {
    var keys = Object.keys(errors || {});
    return keys.length ? errors[keys[0]] : '';
  }

  /* ==================== 数据迁移 ==================== */

  // 一次性迁移：统一库存在且未迁移过时自动执行（幂等：以迁移状态标记为准）
  function runMigrationIfDue() {
    var unified = D.readUnified();
    if (!unified || !unified.length) return null;
    if (D.getMigrationState()) return null;

    var store = D.loadStore();
    var plan = D.migrateUnified(unified, store);

    D.saveStore(store.concat(plan.customers));
    D.savePending(plan.pending);
    var migState = {
      done_at: D.fmtTime(new Date()),
      batch: plan.migrated_batch,
      source_count: unified.length,
      counts: {
        migrated: plan.customers.length,
        pending: plan.pending.length,
        excluded: plan.excluded.length,
        skipped: plan.skipped.length
      },
      excluded: plan.excluded,
      skipped: plan.skipped
    };
    D.saveMigrationState(migState);

    if (plan.customers.length + plan.pending.length > 0) {
      renderMigrationReport(migState);
      openMask('migReportMask');
    }
    return migState;
  }

  function renderMigrationReport(s) {
    var c = s.counts;
    var html = '<div class="form-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 16px;">'
      + kvBlock('存量主体', s.source_count + ' 家')
      + kvBlock('直接迁入', c.migrated + ' 家（钢铁生产企业 → 下游客户）')
      + kvBlock('待人工归类', c.pending + ' 家（矿石贸易商）')
      + kvBlock('移出客户模块', c.excluded + ' 家（资源类主体）')
      + '</div>';
    if (c.skipped > 0) {
      html += '<div class="section-title">查重跳过</div><div class="log-list">'
        + (s.skipped || []).map(function (it) { return '<div class="log-item"><b>' + esc(it.name) + '</b>：' + esc(it.reason) + '</div>'; }).join('')
        + '</div>';
    }
    if ((s.excluded || []).length > 0) {
      html += '<div class="section-title" style="margin-top:16px;">移出清单</div><div class="log-list">'
        + s.excluded.map(function (it) { return '<div class="log-item"><b>' + esc(it.name) + '</b>：' + esc(it.reason) + '</div>'; }).join('')
        + '</div>';
    }
    html += '<div class="modal-note" style="margin-top: 14px;">迁移执行时间：' + esc(s.done_at) + '（一次性执行，非白名单字段不迁移不保留）</div>';
    $('migReportBody').innerHTML = html;
  }

  function kvBlock(label, value) {
    return '<div class="kv-item"><div class="kv-label">' + label + '</div><div class="kv-value" style="font-size:15px;font-weight:600;">' + esc(value) + '</div></div>';
  }

  function renderPendingPanel() {
    var pending = D.loadPending();
    $('migPendingCount').textContent = pending.length;
    var wrap = $('pendingList');
    if (!pending.length) {
      wrap.innerHTML = '<div class="modal-note">全部存量主体已完成归类</div>';
      return;
    }
    wrap.innerHTML = pending.map(function (p) {
      return '<div class="mig-row" data-id="' + esc(p.id) + '">'
        + '<div class="mig-main"><b>' + esc(p.name) + '</b>'
        + '<span class="mig-sub">' + (p.credit_code ? '信用代码 ' + esc(p.credit_code) : '信用代码待补录') + (p.contact ? ' · 联系人 ' + esc(p.contact) : '') + '</span></div>'
        + '<select class="filter-select" data-role="classifyType">'
        + '<option value="集采贸易商">集采贸易商（长协）</option>'
        + '<option value="现货贸易商">现货贸易商（散单）</option>'
        + '</select>'
        + '<button class="btn btn-sm btn-primary" data-act="classify" type="button">确认归类</button>'
        + '</div>';
    }).join('');
  }

  /* ==================== 渲染：KPI / Tabs ==================== */

  function renderKpi(list) {
    $('kpiTotal').textContent = list.length;
    $('kpiActive').textContent = D.listActive(list).length;
    $('kpiType1').textContent = countBy(list, '集采贸易商');
    $('kpiType2').textContent = countBy(list, '现货贸易商');
    $('kpiType3').textContent = countBy(list, '下游客户');
    $('kpiPendingReview').textContent = countBy(list, null, '待审核');
  }

  function countBy(list, type, status) {
    return list.filter(function (c) {
      return (type ? c.customer_type === type : true) && (status ? c.status === status : true);
    }).length;
  }

  function renderTabs(list) {
    $('cntAll').textContent = list.length;
    $('cntT1').textContent = countBy(list, '集采贸易商');
    $('cntT2').textContent = countBy(list, '现货贸易商');
    $('cntT3').textContent = countBy(list, '下游客户');
  }

  /* ==================== 渲染：列表 ==================== */

  function filteredList() {
    var list = D.loadStore();
    var kw = D.trimStr(state.keyword).toLowerCase();
    return list.filter(function (c) {
      if (state.type !== '全部' && c.customer_type !== state.type) return false;
      if (state.status !== '全部' && c.status !== state.status) return false;
      if (kw) {
        var hit = D.nameKeyOf(c.name).toLowerCase().indexOf(kw) >= 0
          || D.trimStr(c.credit_code).toLowerCase().indexOf(kw) >= 0;
        if (!hit) return false;
      }
      return true;
    });
  }

  var STATUS_CLASS = { '待审核': 's-review', '正常': 's-normal', '停用': 's-disabled', '已驳回': 's-rejected' };

  function statusTag(status) {
    return '<span class="c-st ' + (STATUS_CLASS[status] || '') + '">' + esc(status) + '</span>';
  }

  function typeTag(c) {
    if (!c.customer_type) return '<span class="c-tag src">待归类</span>';
    return '<span class="c-type t-' + esc(c.customer_type) + '">' + esc(c.customer_type) + '</span>'
      + '<span class="c-tag src" style="margin-left:6px;">' + esc(D.deriveTag(c.customer_type)) + '</span>';
  }

  function renderTable() {
    var list = filteredList();
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    var rows = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    $('pagerTotal').textContent = total;
    $('pagerNow').textContent = state.page + ' / ' + pages;
    $('btnPrev').disabled = state.page <= 1;
    $('btnNext').disabled = state.page >= pages;
    $('tableEmpty').hidden = total > 0;

    $('custTbody').innerHTML = rows.map(function (c) {
      var ops = [];
      ops.push('<button class="btn btn-sm btn-ghost" data-act="detail" data-id="' + c.id + '" type="button">详情</button>');
      if (c.status === '待审核') {
        ops.push('<button class="btn btn-sm btn-primary" data-act="review" data-id="' + c.id + '" type="button">审核</button>');
      } else {
        ops.push('<button class="btn btn-sm btn-ghost" data-act="edit" data-id="' + c.id + '" type="button">编辑</button>');
        if (c.status === '正常') {
          ops.push('<button class="btn btn-sm btn-ghost" data-act="toggle" data-id="' + c.id + '" type="button">停用</button>');
        } else if (c.status === '停用') {
          ops.push('<button class="btn btn-sm btn-primary" data-act="toggle" data-id="' + c.id + '" type="button">启用</button>');
        }
      }
      return '<tr>'
        + '<td><span class="cust-name" data-act="detail" data-id="' + c.id + '">' + esc(c.name) + '</span></td>'
        + '<td>' + typeTag(c) + '</td>'
        + '<td>' + esc(c.contact || '—') + '</td>'
        + '<td>' + esc(c.phone || '—') + '</td>'
        + '<td>' + statusTag(c.status) + '</td>'
        + '<td>' + esc(c.source) + '</td>'
        + '<td>' + esc(c.updated_at) + '</td>'
        + '<td style="text-align:right; white-space:nowrap;">' + ops.join('') + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderAll() {
    var list = D.loadStore();
    var pending = D.loadPending();
    $('migBanner').hidden = pending.length === 0;
    $('migPendingCount').textContent = pending.length;
    var migState = D.getMigrationState();
    $('btnMigPanel').hidden = !migState && pending.length === 0;

    renderKpi(list);
    renderTabs(list);
    renderTable();
    renderPendingPanel();
  }

  /* ==================== 详情抽屉（F2） ==================== */

  function findCustomer(id) {
    return D.loadStore().filter(function (c) { return c.id === id; })[0] || null;
  }

  function openDrawer(id) {
    var c = findCustomer(id);
    if (!c) return;
    ctx.currentDetail = c;
    $('drawerTitle').textContent = c.name;

    var html = '<div class="drawer-section"><div class="section-title">基本信息</div><div class="kv-grid">'
      + kvItem('客户名称', c.name)
      + kvItem('客户类型', esc(c.customer_type) + '（' + esc(D.deriveTag(c.customer_type)) + '）')
      + kvItem('联系人', c.contact)
      + kvItem('联系方式', c.phone)
      + kvItem('统一社会信用代码', c.credit_code || '待补录')
      + kvItem('客户来源', c.source)
      + kvItem('状态', '<span class="c-st ' + (STATUS_CLASS[c.status] || '') + '">' + esc(c.status) + '</span>')
      + kvItem('创建时间', c.created_at)
      + kvItem('更新时间', c.updated_at)
      + '</div></div>';

    if (c.customer_type === '现货贸易商') {
      var files = (c.credentials || []);
      html += '<div class="drawer-section"><div class="section-title">资质凭证（' + files.length + '）</div>';
      html += files.length
        ? '<div class="ref-list">' + files.map(function (f) {
            return '<div class="ref-item">' + esc(f.name) + '<span style="color:#86868b;font-size:12px;margin-left:8px;">'
              + esc(fmtSize(f.size)) + (f.type ? ' · ' + esc(f.type) : '') + '</span></div>';
          }).join('') + '</div>'
        : '<div class="modal-note">未上传凭证</div>';
      html += '</div>';
    }

    if (c.status === '已驳回' && c.reject_reason) {
      html += '<div class="drawer-section"><div class="section-title">驳回原因</div>'
        + '<div class="reject-box">' + esc(c.reject_reason) + '</div></div>';
    }

    var logs = (c.history || []);
    html += '<div class="drawer-section"><div class="section-title">操作记录</div><div class="log-list">'
      + logs.slice().reverse().map(function (h) {
        return '<div class="log-item"><div class="log-head"><b>' + esc(h.action) + '</b><span>' + esc(h.ts) + ' · ' + esc(h.operator) + '</span></div>'
          + (h.detail ? '<div class="log-detail">' + esc(h.detail) + '</div>' : '') + '</div>';
      }).join('')
      + '</div></div>';

    $('drawerBody').innerHTML = html;
    $('drawerMask').hidden = false;
    $('custDrawer').hidden = false;
    requestAnimationFrame(function () {
      $('custDrawer').classList.add('open');
      $('drawerMask').classList.add('show');
    });
  }

  function kvItem(label, value) {
    return '<div class="kv-item"><div class="kv-label">' + label + '</div><div class="kv-value">' + (value == null ? '—' : value) + '</div></div>';
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB'
      : n >= 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B';
  }

  function closeDrawer() {
    $('custDrawer').classList.remove('open');
    $('drawerMask').classList.remove('show');
    setTimeout(function () { $('custDrawer').hidden = true; $('drawerMask').hidden = true; }, 260);
  }

  /* ==================== 代注册（F3） ==================== */

  function bindCreateModal() {
    $('btnCreate').addEventListener('click', function () {
      $('createName').value = ''; $('createCode').value = '';
      $('createContact').value = ''; $('createPhone').value = '';
      clearErrors($('createMask'));
      setCreateType('集采贸易商');
      openMask('createMask');
    });
    $('btnCreateEmpty').addEventListener('click', function () { $('btnCreate').click(); });

    $('createTypePills').addEventListener('click', function (e) {
      var pill = e.target.closest('.type-pill');
      if (pill) setCreateType(pill.dataset.v);
    });

    $('btnCreateSave').addEventListener('click', function () {
      var data = {
        customer_type: ctx.createType,
        name: $('createName').value,
        credit_code: $('createCode').value,
        contact: $('createContact').value,
        phone: $('createPhone').value
      };
      var res = D.createByOperator(D.loadStore(), data);
      if (!res.ok) {
        showErrors($('createMask'), res.errors || {});
        if (res.code === 'DUP') toast(res.error, 'error');
        else toast(firstError(res.errors) || res.error, 'error');
        return;
      }
      D.saveStore(res.list);
      closeMask('createMask');
      toast('已创建并生效：' + res.customer.name, 'success');
      renderAll();
    });
  }

  function setCreateType(t) {
    ctx.createType = t;
    $('createTypePills').querySelectorAll('.type-pill').forEach(function (p) {
      p.classList.toggle('active', p.dataset.v === t);
    });
  }

  /* ==================== 编辑（F6） ==================== */

  function openEditModal(id) {
    var c = findCustomer(id);
    if (!c) return;
    ctx.editId = id;
    $('editName').value = c.name;
    $('editContact').value = c.contact;
    $('editPhone').value = c.phone;
    $('editCodeWrap').hidden = !!c.credit_code;
    $('editCode').value = '';
    clearErrors($('editMask'));
    openMask('editMask');
  }

  function bindEditModal() {
    $('btnEditSave').addEventListener('click', function () {
      var patch = { contact: $('editContact').value, phone: $('editPhone').value };
      if (!$('editCodeWrap').hidden) patch.credit_code = $('editCode').value;
      var res = D.updateInfo(D.loadStore(), ctx.editId, patch, { role: 'operator' });
      if (!res.ok) {
        showErrors($('editMask'), res.errors || {});
        toast(firstError(res.errors) || res.error, 'error');
        return;
      }
      D.saveStore(res.list);
      closeMask('editMask');
      toast(res.changed.length ? '已保存：' + res.changed.join('、') : '信息未变化', 'success');
      renderAll();
    });
  }

  /* ==================== 审核（F5） ==================== */

  function openReviewModal(id) {
    var c = findCustomer(id);
    if (!c) return;
    ctx.reviewId = id;
    ctx.reviewDecision = 'approve';
    $('reviewInfo').innerHTML = kvItem('客户名称', esc(c.name))
      + kvItem('客户类型', esc(c.customer_type))
      + kvItem('联系人', esc(c.contact))
      + kvItem('联系方式', esc(c.phone))
      + kvItem('统一社会信用代码', esc(c.credit_code))
      + kvItem('注册时间', esc(c.created_at))
      + '<div class="kv-item" style="grid-column: 1 / -1;"><div class="kv-label">资质凭证（' + (c.credentials || []).length + '）</div><div class="kv-value">'
      + ((c.credentials || []).map(function (f) { return esc(f.name); }).join('；') || '未上传')
      + '</div></div>';
    $('rejectReason').value = '';
    clearErrors($('reviewMask'));
    setReviewDecision('approve');
    openMask('reviewMask');
  }

  function setReviewDecision(d) {
    ctx.reviewDecision = d;
    $('reviewDecision').querySelectorAll('.type-pill').forEach(function (p) {
      p.classList.toggle('active', p.dataset.v === d);
    });
    $('rejectReasonWrap').hidden = d !== 'reject';
  }

  function bindReviewModal() {
    $('reviewDecision').addEventListener('click', function (e) {
      var pill = e.target.closest('.type-pill');
      if (pill) setReviewDecision(pill.dataset.v);
    });
    $('btnReviewSave').addEventListener('click', function () {
      var store = D.loadStore();
      var res;
      if (ctx.reviewDecision === 'approve') {
        res = D.reviewApprove(store, ctx.reviewId);
      } else {
        res = D.reviewReject(store, ctx.reviewId, $('rejectReason').value);
        if (!res.ok && res.errors && res.errors.reject_reason) {
          showErrors($('reviewMask'), res.errors);
          toast(res.errors.reject_reason, 'error');
          return;
        }
      }
      if (!res.ok) { toast(res.error, 'error'); return; }
      D.saveStore(res.list);
      closeMask('reviewMask');
      toast(ctx.reviewDecision === 'approve' ? '审核通过，客户已生效' : '已驳回，原因已记录', 'success');
      renderAll();
    });
  }

  /* ==================== 停用 / 启用（F7） ==================== */

  function openConfirmToggle(id) {
    var c = findCustomer(id);
    if (!c) return;
    ctx.confirmId = id;
    ctx.confirmTarget = c.status === '正常' ? '停用' : '正常';
    var disabling = ctx.confirmTarget === '停用';
    $('confirmTitle').textContent = disabling ? '停用客户' : '启用客户';
    $('btnConfirmSave').textContent = disabling ? '确认停用' : '确认启用';
    $('confirmText').innerHTML = disabling
      ? '确认停用「<b>' + esc(c.name) + '</b>」？<div class="modal-note" style="margin-top:8px;">停用后该客户不可被新建订单等业务引用，存量业务数据不受影响；可随时重新启用</div>'
      : '确认启用「<b>' + esc(c.name) + '</b>」？<div class="modal-note" style="margin-top:8px;">启用后恢复为正常状态，可被业务引用</div>';
    openMask('confirmMask');
  }

  function bindConfirmModal() {
    $('btnConfirmSave').addEventListener('click', function () {
      var res = D.setStatus(D.loadStore(), ctx.confirmId, ctx.confirmTarget);
      if (!res.ok) { toast(res.error, 'error'); return; }
      D.saveStore(res.list);
      closeMask('confirmMask');
      toast(res.customer.status === '停用' ? '已停用：' + res.customer.name : '已启用：' + res.customer.name, 'success');
      renderAll();
    });
  }

  /* ==================== 归类面板 ==================== */

  function bindClassifyPanel() {
    $('btnClassify').addEventListener('click', function () { renderPendingPanel(); openMask('classifyMask'); });
    $('btnMigPanel').addEventListener('click', function () {
      renderPendingPanel();
      if (D.loadPending().length) openMask('classifyMask');
      else { renderMigrationReport(D.getMigrationState() || { counts: {}, done_at: '—' }); openMask('migReportMask'); }
    });
    $('btnMigReport').addEventListener('click', function () {
      renderMigrationReport(D.getMigrationState() || { counts: {}, done_at: '—' });
      openMask('migReportMask');
    });
    $('pendingList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act="classify"]');
      if (!btn) return;
      var row = btn.closest('.mig-row');
      var id = row.dataset.id;
      var type = row.querySelector('[data-role="classifyType"]').value;
      var res = D.classifyPending(D.loadStore(), D.loadPending(), id, type);
      if (!res.ok) { toast(res.error, 'error'); return; }
      D.saveStore(res.list);
      D.savePending(res.pending);
      toast('已归类为「' + type + '」：' + res.customer.name, 'success');
      renderAll();
      renderPendingPanel();
    });
  }

  /* ==================== 事件绑定 ==================== */

  function bindEvents() {
    // 类型 Tab
    $('typeTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.view-tab');
      if (!tab) return;
      state.type = tab.dataset.type;
      state.page = 1;
      $('typeTabs').querySelectorAll('.view-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      renderTable();
    });

    // 搜索 / 状态筛选
    var searchTimer = null;
    $('searchInput').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.keyword = $('searchInput').value;
        state.page = 1;
        renderTable();
      }, 200);
    });
    $('statusSelect').addEventListener('change', function () {
      state.status = this.value;
      state.page = 1;
      renderTable();
    });
    $('btnReset').addEventListener('click', function () {
      state.type = '全部'; state.status = '全部'; state.keyword = ''; state.page = 1;
      $('searchInput').value = ''; $('statusSelect').value = '全部';
      $('typeTabs').querySelectorAll('.view-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.type === '全部'); });
      renderTable();
    });

    // 分页
    $('btnPrev').addEventListener('click', function () { if (state.page > 1) { state.page--; renderTable(); } });
    $('btnNext').addEventListener('click', function () { state.page++; renderTable(); });

    // 表格操作（事件委托）
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act;
      var id = el.dataset.id;
      if (act === 'detail') openDrawer(id);
      else if (act === 'edit') openEditModal(id);
      else if (act === 'review') openReviewModal(id);
      else if (act === 'toggle') openConfirmToggle(id);
      else if (act === 'classify') { /* 在归类面板内部处理 */ }
    });

    // 关闭类按钮
    document.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeMask(btn.dataset.close); });
    });
    $('drawerClose').addEventListener('click', closeDrawer);
    $('drawerMask').addEventListener('click', closeDrawer);
    ['createMask', 'editMask', 'reviewMask', 'confirmMask', 'classifyMask', 'migReportMask'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === this) closeMask(id); });
    });

    // Esc 关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('custDrawer').hidden) closeDrawer();
        ['createMask', 'editMask', 'reviewMask', 'confirmMask', 'classifyMask', 'migReportMask'].forEach(function (id) {
          if (!$(id).hidden) closeMask(id);
        });
      }
    });

    bindCreateModal();
    bindEditModal();
    bindReviewModal();
    bindConfirmModal();
    bindClassifyPanel();
  }

  /* ==================== 启动 ==================== */

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    try { runMigrationIfDue(); } catch (e) { console.error('迁移执行失败', e); }
    renderAll();
  });
})();
